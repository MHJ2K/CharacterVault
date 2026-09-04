import type { CharacterBook, CharacterSpec } from '../../../db/characterTypes';
import {
  cloneChangeValue,
  type AgentCommitResult,
  type AgentPendingChange,
} from '../../core/changes';
import { formatCustomContextChunk } from '../../../services/CustomContextService';
import type { ActionResult, AgentHost, AgentToolMode, ParsedAction } from '../../core/types';
import { createLorebookHost, type LorebookAgentHost } from '../lorebook/createHost';
import { LOREBOOK_TOOL_SPECS } from '../lorebook/schemas';
import { LOREBOOK_TOOL_NAMES } from '../lorebook/tools';
import { MAX_REPLACE_ACROSS_PER_RUN } from '../search';
import { formatFieldCatalog, formatFieldRead, formatGreetingRead } from './catalog';
import {
  CHARACTER_AGENT_FIELD_IDS,
  cloneSpec,
  isCharacterAgentFieldId,
  parseGreetingIndex,
} from './fields';
import { buildCharacterAgentSystemPrompt } from './prompt';
import { CHARACTER_TOOL_SPECS } from './schemas';
import {
  addGreeting,
  appendToField,
  auditCard,
  CHARACTER_OVERRIDES_LOREBOOK_TOOLS,
  CHARACTER_TOOL_NAMES,
  deleteGreeting,
  listFields,
  listGreetings,
  MAX_FIELD_UPDATES_PER_RUN,
  MAX_GREETING_MUTATIONS_PER_RUN,
  moveGreeting,
  readField,
  readGreeting,
  replaceAcrossCard,
  replaceInField,
  replaceInGreeting,
  searchCard,
  updateField,
  updateGreeting,
} from './tools';
import { getFieldValue, setFieldValue } from './fields';

const LOREBOOK_TOOL_NAME_SET = new Set<string>(LOREBOOK_TOOL_NAMES);
const COMPOSED_LOREBOOK_NAMES = LOREBOOK_TOOL_NAMES.filter(
  (name) => !CHARACTER_OVERRIDES_LOREBOOK_TOOLS.has(name),
);
const COMPOSED_LOREBOOK_SPECS = LOREBOOK_TOOL_SPECS.filter(
  (spec) => !CHARACTER_OVERRIDES_LOREBOOK_TOOLS.has(spec.name),
);

export interface CharacterHostPersist {
  spec?: CharacterSpec;
  book?: CharacterBook;
}

export interface CharacterHostIO {
  getSpec: () => CharacterSpec;
  getBook: () => CharacterBook;
  persist: (update: CharacterHostPersist) => Promise<void>;
  getCustomContext: () => Promise<string | null>;
  takeSnapshot?: () => Promise<void>;
  maxFieldUpdates?: number;
  maxGreetingMutations?: number;
}

const SPEC_TARGETS: readonly string[] = [...CHARACTER_AGENT_FIELD_IDS, 'alternate_greetings'];

/** Alternate greetings are the only array-typed target (tags are stored as an array but edited as text). */
function isArrayTarget(id: string): boolean {
  return id === 'alternate_greetings';
}

function specText(spec: CharacterSpec, id: string): string {
  if (id === 'alternate_greetings') {
    return JSON.stringify(spec.alternate_greetings ?? [], null, 2);
  }
  if (!isCharacterAgentFieldId(id)) return '';
  return getFieldValue(spec, id);
}

function applySpecText(
  spec: CharacterSpec,
  id: string,
  text: string,
): CharacterSpec | undefined {
  if (id === 'alternate_greetings') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      return undefined;
    }
    return { ...spec, alternate_greetings: parsed };
  }
  if (!isCharacterAgentFieldId(id)) return undefined;
  return setFieldValue(spec, id, text);
}

function specLabel(id: string): string {
  if (id === 'alternate_greetings') return 'Alternate greetings';
  return `Card field: ${id}`;
}

function changeForTarget(
  baseline: CharacterSpec,
  current: CharacterSpec,
  id: string,
): AgentPendingChange | null {
  const beforeText = specText(baseline, id);
  const afterText = specText(current, id);
  if (beforeText === afterText) return null;
  return {
    id: `spec:${id}`,
    label: specLabel(id),
    target: `field:${id}`,
    beforeText,
    afterText,
    valueType: isArrayTarget(id) ? 'json' : 'text',
    destructive: beforeText.trim().length > 0 && afterText.trim().length === 0,
  };
}

export function createCharacterHost(io: CharacterHostIO): AgentHost {
  const maxFieldUpdates = io.maxFieldUpdates ?? MAX_FIELD_UPDATES_PER_RUN;
  const maxGreetingMutations = io.maxGreetingMutations ?? MAX_GREETING_MUTATIONS_PER_RUN;
  let baselineSpec = cloneSpec(io.getSpec());
  let spec = cloneSpec(baselineSpec);
  let specDirty = false;
  let pendingBook: CharacterBook | null = null;
  let fieldUpdatesThisRun = 0;
  let greetingMutationsThisRun = 0;
  let replaceAcrossThisRun = 0;
  const fieldReadCache = new Map<string, string>();
  const greetingReadCache = new Map<number, string>();
  const afterOverrides = new Map<string, string>();
  let snapshotTaken = false;
  let cachedCustomChunk: string | null | undefined;

  const loreHost: LorebookAgentHost = createLorebookHost({
    getBook: () => io.getBook(),
    setBook: async (book) => {
      pendingBook = cloneChangeValue(book);
    },
    getCustomContext: async () => null,
  });

  const cacheFieldRead = (id: string, formatted: string): void => {
    fieldReadCache.set(id, formatted);
  };

  const cacheGreetingRead = (index: number, formatted: string): void => {
    greetingReadCache.set(index, formatted);
  };

  const dropGreetingCacheFrom = (index: number): void => {
    for (const key of [...greetingReadCache.keys()]) {
      if (key >= index) greetingReadCache.delete(key);
    }
  };

  const getPendingChanges = (): AgentPendingChange[] => {
    const changes: AgentPendingChange[] = [];
    for (const target of SPEC_TARGETS) {
      const change = changeForTarget(baselineSpec, spec, target);
      if (!change) continue;
      const override = afterOverrides.get(change.id);
      changes.push(override !== undefined ? { ...change, afterText: override } : change);
    }
    changes.push(...(loreHost.getPendingChanges?.() ?? []));
    return changes;
  };

  const commitPendingChanges = async (
    selectedIds?: ReadonlySet<string>,
  ): Promise<AgentCommitResult> => {
    const all = getPendingChanges();
    const selected = all.filter((change) => !selectedIds || selectedIds.has(change.id));
    const result: AgentCommitResult = { applied: [], conflicts: [], invalid: [] };
    if (selected.length === 0) return result;

    // Validate every selected spec proposal against the live card before
    // touching anything, so approval is all-or-nothing per batch.
    const liveSpec = cloneChangeValue(io.getSpec());
    const validatedSpecChanges: AgentPendingChange[] = [];
    for (const change of selected.filter((item) => item.id.startsWith('spec:'))) {
      const id = change.id.slice('spec:'.length);
      if (!SPEC_TARGETS.includes(id)) {
        result.invalid.push({ change, message: 'Unknown card field in this proposal.' });
        continue;
      }
      if (specText(liveSpec, id) !== specText(baselineSpec, id)) {
        result.conflicts.push({
          change,
          message: `${specLabel(id)} changed while the agent was working.`,
        });
        continue;
      }
      const merged = applySpecText(liveSpec, id, change.afterText);
      if (!merged) {
        result.invalid.push({
          change,
          message: isArrayTarget(id)
            ? 'Alternate greetings must be a valid JSON array of strings.'
            : `${specLabel(id)} contains an invalid value.`,
        });
        continue;
      }
      validatedSpecChanges.push(change);
    }

    const bookChangeIds = selected
      .filter((change) => change.id.startsWith('book:'))
      .map((change) => change.id);
    const bookResult =
      bookChangeIds.length > 0 && result.conflicts.length === 0 && result.invalid.length === 0
        ? await loreHost.commitPendingChanges?.(new Set(bookChangeIds))
        : undefined;
    if (bookResult) {
      result.applied.push(...bookResult.applied);
      result.conflicts.push(...bookResult.conflicts);
      result.invalid.push(...bookResult.invalid);
    }
    if (result.conflicts.length > 0 || result.invalid.length > 0) {
      return result;
    }
    result.applied.unshift(...validatedSpecChanges);
    if (result.applied.length === 0) return result;

    const committedSpec = cloneChangeValue(liveSpec);
    for (const change of validatedSpecChanges) {
      const id = change.id.slice('spec:'.length);
      const merged = applySpecText(committedSpec, id, change.afterText);
      if (merged) Object.assign(committedSpec, merged);
    }

    await io.takeSnapshot?.();
    await io.persist({
      spec: validatedSpecChanges.length > 0 ? committedSpec : undefined,
      book: bookResult && bookResult.applied.length > 0 ? pendingBook ?? undefined : undefined,
    });

    for (const change of validatedSpecChanges) afterOverrides.delete(change.id);
    spec = cloneSpec(committedSpec);
    baselineSpec = cloneSpec(committedSpec);
    specDirty = false;
    pendingBook = null;
    return result;
  };

  const host: AgentHost = {
    toolNames: [...CHARACTER_TOOL_NAMES, ...COMPOSED_LOREBOOK_NAMES],
    tools: [...CHARACTER_TOOL_SPECS, ...COMPOSED_LOREBOOK_SPECS],

    buildSystemPrompt(input: { extraChunks: string[]; toolMode?: AgentToolMode }): string {
      return buildCharacterAgentSystemPrompt(input.extraChunks, input.toolMode ?? 'native');
    },

    async extraContextChunks(): Promise<string[]> {
      if (cachedCustomChunk === undefined) {
        const custom = await io.getCustomContext();
        cachedCustomChunk = custom ? formatCustomContextChunk(custom) : null;
      }
      const chunks: string[] = [];
      if (cachedCustomChunk) chunks.push(cachedCustomChunk);
      chunks.push(formatFieldCatalog(spec));
      chunks.push(...(await loreHost.extraContextChunks()));
      return chunks;
    },

    async execute(action: ParsedAction): Promise<ActionResult> {
      if (action.name === 'search') return searchCard(spec, loreHost.peekBook(), action);
      if (action.name === 'audit_card') return auditCard(spec, loreHost.peekBook());
      if (action.name === 'replace_across') {
        if (replaceAcrossThisRun >= MAX_REPLACE_ACROSS_PER_RUN) {
          return {
            ok: false,
            toolName: 'replace_across',
            message: `limit: max ${MAX_REPLACE_ACROSS_PER_RUN} replace_across calls per run`,
          };
        }
        const applied = replaceAcrossCard(spec, loreHost.peekBook(), action);
        if (!applied.result.ok) return applied.result;
        if (applied.specChanged) {
          spec = applied.spec;
          specDirty = true;
          fieldReadCache.clear();
          greetingReadCache.clear();
        }
        if (applied.bookChanged) {
          loreHost.applyBook(applied.book);
          pendingBook = applied.book;
        }
        if (applied.specChanged || applied.bookChanged) replaceAcrossThisRun += 1;
        return applied.result;
      }
      if (LOREBOOK_TOOL_NAME_SET.has(action.name)) return loreHost.execute(action);
      if (action.name === 'list_fields') return listFields(spec);
      if (action.name === 'read_field') {
        const rawId = (action.headers.id ?? '').trim();
        if (isCharacterAgentFieldId(rawId)) {
          const cached = fieldReadCache.get(rawId);
          if (cached != null) return { ok: true, toolName: 'read_field', message: cached };
        }
        const result = readField(spec, action);
        if (result.ok && isCharacterAgentFieldId(rawId)) cacheFieldRead(rawId, result.message);
        return result;
      }
      if (action.name === 'update_field') {
        if (fieldUpdatesThisRun >= maxFieldUpdates) {
          return {
            ok: false,
            toolName: 'update_field',
            message: `limit: max ${maxFieldUpdates} field updates per run`,
          };
        }
        const applied = updateField(spec, action);
        if (!applied.result.ok) return applied.result;
        spec = applied.spec;
        specDirty = true;
        fieldUpdatesThisRun += 1;
        const rawId = (action.headers.id ?? '').trim();
        if (isCharacterAgentFieldId(rawId)) cacheFieldRead(rawId, formatFieldRead(spec, rawId));
        return applied.result;
      }
      if (action.name === 'append_to_field') {
        if (fieldUpdatesThisRun >= maxFieldUpdates) {
          return {
            ok: false,
            toolName: 'append_to_field',
            message: `limit: max ${maxFieldUpdates} field updates per run`,
          };
        }
        const applied = appendToField(spec, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          spec = applied.spec;
          specDirty = true;
          fieldUpdatesThisRun += 1;
          const rawId = (action.headers.id ?? '').trim();
          if (isCharacterAgentFieldId(rawId)) cacheFieldRead(rawId, formatFieldRead(spec, rawId));
        }
        return applied.result;
      }
      if (action.name === 'replace_in_field') {
        if (fieldUpdatesThisRun >= maxFieldUpdates) {
          return {
            ok: false,
            toolName: 'replace_in_field',
            message: `limit: max ${maxFieldUpdates} field updates per run`,
          };
        }
        const applied = replaceInField(spec, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          spec = applied.spec;
          specDirty = true;
          fieldUpdatesThisRun += 1;
          const rawId = (action.headers.id ?? '').trim();
          if (isCharacterAgentFieldId(rawId)) cacheFieldRead(rawId, formatFieldRead(spec, rawId));
        }
        return applied.result;
      }
      if (action.name === 'list_greetings') return listGreetings(spec);
      if (action.name === 'read_greeting') {
        const greetings = spec.alternate_greetings ?? [];
        const index = parseGreetingIndex(action.headers.index, greetings.length);
        if (index != null) {
          const cached = greetingReadCache.get(index);
          if (cached != null) return { ok: true, toolName: 'read_greeting', message: cached };
        }
        const result = readGreeting(spec, action);
        if (result.ok && index != null) cacheGreetingRead(index, result.message);
        return result;
      }
      if (action.name === 'add_greeting') {
        if (greetingMutationsThisRun >= maxGreetingMutations) {
          return {
            ok: false,
            toolName: 'add_greeting',
            message: `limit: max ${maxGreetingMutations} greeting changes per run`,
          };
        }
        const applied = addGreeting(spec, action);
        spec = applied.spec;
        specDirty = true;
        greetingMutationsThisRun += 1;
        const greetings = spec.alternate_greetings ?? [];
        const index = greetings.length - 1;
        cacheGreetingRead(index, formatGreetingRead(greetings, index));
        return applied.result;
      }
      if (action.name === 'update_greeting') {
        if (greetingMutationsThisRun >= maxGreetingMutations) {
          return {
            ok: false,
            toolName: 'update_greeting',
            message: `limit: max ${maxGreetingMutations} greeting changes per run`,
          };
        }
        const applied = updateGreeting(spec, action);
        if (!applied.result.ok) return applied.result;
        spec = applied.spec;
        specDirty = true;
        greetingMutationsThisRun += 1;
        const greetings = spec.alternate_greetings ?? [];
        const index = parseGreetingIndex(action.headers.index, greetings.length);
        if (index != null) cacheGreetingRead(index, formatGreetingRead(greetings, index));
        return applied.result;
      }
      if (action.name === 'replace_in_greeting') {
        if (greetingMutationsThisRun >= maxGreetingMutations) {
          return {
            ok: false,
            toolName: 'replace_in_greeting',
            message: `limit: max ${maxGreetingMutations} greeting changes per run`,
          };
        }
        const applied = replaceInGreeting(spec, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          spec = applied.spec;
          specDirty = true;
          greetingMutationsThisRun += 1;
          const greetings = spec.alternate_greetings ?? [];
          const index = parseGreetingIndex(action.headers.index, greetings.length);
          if (index != null) cacheGreetingRead(index, formatGreetingRead(greetings, index));
        }
        return applied.result;
      }
      if (action.name === 'move_greeting') {
        if (greetingMutationsThisRun >= maxGreetingMutations) {
          return {
            ok: false,
            toolName: 'move_greeting',
            message: `limit: max ${maxGreetingMutations} greeting changes per run`,
          };
        }
        const greetingsBefore = spec.alternate_greetings ?? [];
        const from = parseGreetingIndex(action.headers.index, greetingsBefore.length);
        const to = parseGreetingIndex(action.headers.to, greetingsBefore.length);
        const applied = moveGreeting(spec, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          spec = applied.spec;
          specDirty = true;
          greetingMutationsThisRun += 1;
          const dropFrom = Math.min(from ?? 0, to ?? 0);
          dropGreetingCacheFrom(dropFrom);
        }
        return applied.result;
      }
      if (action.name === 'delete_greeting') {
        if (greetingMutationsThisRun >= maxGreetingMutations) {
          return {
            ok: false,
            toolName: 'delete_greeting',
            message: `limit: max ${maxGreetingMutations} greeting changes per run`,
          };
        }
        const greetingsBefore = spec.alternate_greetings ?? [];
        const index = parseGreetingIndex(action.headers.index, greetingsBefore.length);
        const applied = deleteGreeting(spec, action);
        if (!applied.result.ok) return applied.result;
        spec = applied.spec;
        specDirty = true;
        greetingMutationsThisRun += 1;
        if (index != null) dropGreetingCacheFrom(index);
        return applied.result;
      }
      return {
        ok: false,
        toolName: action.name,
        message: `unknown_action: ${action.name}`,
      };
    },

    getPendingChanges,

    updatePendingChange(update): boolean {
      if (!getPendingChanges().some((change) => change.id === update.id)) return false;
      if (update.id.startsWith('book:')) {
        return loreHost.updatePendingChange?.(update) ?? false;
      }
      afterOverrides.set(update.id, update.afterText);
      return true;
    },

    discardPendingChanges(): void {
      afterOverrides.clear();
      spec = cloneSpec(baselineSpec);
      specDirty = false;
      pendingBook = null;
      loreHost.discardPendingChanges?.();
      fieldReadCache.clear();
      greetingReadCache.clear();
    },

    async commitPendingChanges(selectedIds?: ReadonlySet<string>) {
      return commitPendingChanges(selectedIds);
    },

    async flush(): Promise<void> {
      await loreHost.flush?.();
      if (!specDirty && pendingBook == null && afterOverrides.size === 0) return;
      if (afterOverrides.size > 0) {
        await commitPendingChanges();
        return;
      }
      if (!snapshotTaken) {
        await io.takeSnapshot?.();
        snapshotTaken = true;
      }
      await io.persist({
        spec: specDirty ? spec : undefined,
        book: pendingBook ?? undefined,
      });
      specDirty = false;
      pendingBook = null;
      baselineSpec = cloneSpec(spec);
    },
  };

  return host;
}
