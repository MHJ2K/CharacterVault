import type { CharacterBook, LorebookEntry } from '../../../db/characterTypes';
import {
  cloneChangeValue,
  stableSerialize,
  type AgentCommitResult,
  type AgentPendingChange,
} from '../../core/changes';
import { formatCustomContextChunk } from '../../../services/CustomContextService';
import type { ActionResult, AgentHost, AgentToolMode, ParsedAction } from '../../core/types';
import { MAX_REPLACE_ACROSS_PER_RUN } from '../search';
import { formatEntryCatalog } from './catalog';
import { buildLorebookAgentSystemPrompt } from './prompt';
import { LOREBOOK_TOOL_SPECS } from './schemas';
import {
  addEntry,
  auditBook,
  deleteEntry,
  entryDisplayName,
  findEntryById,
  findEntryByName,
  formatEntryRead,
  listEntries,
  LOREBOOK_TOOL_NAMES,
  MAX_DELETES_PER_RUN,
  MAX_NEW_ENTRIES_PER_RUN,
  MAX_UPDATES_PER_RUN,
  parseEntryId,
  readEntry,
  readRecursion,
  replaceAcrossBook,
  replaceInEntry,
  searchBook,
  updateBookSettings,
  updateEntry,
} from './tools';

export interface LorebookAgentHost extends AgentHost {
  peekBook(): CharacterBook;
  applyBook(book: CharacterBook): void;
}

export interface LorebookHostIO {
  getBook: () => CharacterBook;
  setBook: (book: CharacterBook) => Promise<void>;
  getCustomContext: () => Promise<string | null>;
  takeSnapshot?: () => Promise<void>;
  maxNewEntries?: number;
}

type BookSettings = Pick<
  CharacterBook,
  'name' | 'description' | 'scan_depth' | 'token_budget' | 'recursive_scanning'
>;

function settingsOf(book: CharacterBook): BookSettings {
  return {
    name: book.name ?? '',
    description: book.description ?? '',
    scan_depth: book.scan_depth,
    token_budget: book.token_budget,
    recursive_scanning: book.recursive_scanning,
  };
}

function entryOf(book: CharacterBook, id: number): LorebookEntry | undefined {
  return (book.entries ?? []).find((entry) => entry.id === id);
}

function replaceEntry(book: CharacterBook, id: number, next: LorebookEntry | null): CharacterBook {
  const entries = (book.entries ?? []).filter((entry) => entry.id !== id);
  if (next) {
    const originalIndex = (book.entries ?? []).findIndex((entry) => entry.id === id);
    if (originalIndex < 0) {
      entries.push(next);
    } else {
      entries.splice(Math.min(originalIndex, entries.length), 0, next);
    }
  }
  return { ...book, entries };
}

const SETTINGS_CHANGE_ID = 'book:settings';

function serializeSettings(book: CharacterBook): string {
  return JSON.stringify(settingsOf(book), null, 2);
}

function serializeEntry(entry: LorebookEntry | undefined): string {
  return entry ? JSON.stringify(entry, null, 2) : '';
}

function parseEntryProposal(id: number, raw: string): LorebookEntry | null | undefined {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as LorebookEntry;
    if (
      !parsed ||
      parsed.id !== id ||
      typeof parsed.content !== 'string' ||
      !Array.isArray(parsed.keys)
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function parseSettingsProposal(raw: string): BookSettings | undefined {
  try {
    const parsed = JSON.parse(raw) as BookSettings;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function createLorebookHost(io: LorebookHostIO): LorebookAgentHost {
  const maxNewEntries = io.maxNewEntries ?? MAX_NEW_ENTRIES_PER_RUN;
  let baselineBook = cloneChangeValue(io.getBook());
  let book = cloneChangeValue(baselineBook);
  let dirty = false;
  let addedThisRun = 0;
  let updatedThisRun = 0;
  let deletedThisRun = 0;
  let replaceAcrossThisRun = 0;
  const revisableIds = new Set<number>();
  const entryReadCache = new Map<number, string>();
  const afterOverrides = new Map<string, string>();
  let cachedCustomChunk: string | null | undefined;

  const cacheEntryRead = (id: number, formatted: string): void => {
    entryReadCache.set(id, formatted);
  };

  const cacheBookEntry = (id: number): void => {
    const entry = findEntryById(book.entries ?? [], id);
    if (entry) cacheEntryRead(id, formatEntryRead(entry));
  };

  const entryIds = (): Set<number> =>
    new Set<number>([
      ...(baselineBook.entries ?? []).map((entry) => entry.id),
      ...(book.entries ?? []).map((entry) => entry.id),
    ]);

  const getPendingChanges = (): AgentPendingChange[] => {
    const changes: AgentPendingChange[] = [];
    const settingsOverride = afterOverrides.get(SETTINGS_CHANGE_ID);
    const beforeSettings = serializeSettings(baselineBook);
    const afterSettings = settingsOverride ?? serializeSettings(book);
    if (settingsOverride !== undefined || beforeSettings !== afterSettings) {
      changes.push({
        id: SETTINGS_CHANGE_ID,
        label: 'Lorebook settings',
        target: 'settings',
        beforeText: beforeSettings,
        afterText: afterSettings,
        valueType: 'json',
      });
    }
    for (const id of entryIds()) {
      const before = entryOf(baselineBook, id);
      const after = entryOf(book, id);
      const override = afterOverrides.get(`book:entry:${id}`);
      const beforeText = serializeEntry(before);
      const afterText = override ?? serializeEntry(after);
      if (override === undefined && beforeText === afterText) continue;
      changes.push({
        id: `book:entry:${id}`,
        label: `Lorebook entry #${id}${after?.name && after.name !== before?.name ? ` (${after.name})` : before?.name ? ` (${before.name})` : ''}`,
        target: `entry:${id}`,
        beforeText,
        afterText,
        valueType: 'json',
        destructive: Boolean(before && !after && override === undefined),
      });
    }
    return changes;
  };

  const commitPendingChanges = async (
    selectedIds?: ReadonlySet<string>,
  ): Promise<AgentCommitResult> => {
    const selected = getPendingChanges().filter(
      (change) => !selectedIds || selectedIds.has(change.id),
    );
    const result: AgentCommitResult = { applied: [], conflicts: [], invalid: [] };
    if (selected.length === 0) return result;

    const live = cloneChangeValue(io.getBook());
    type Planned = { change: AgentPendingChange; entry?: LorebookEntry | null };
    const planned: Planned[] = [];
    for (const change of selected) {
      const afterText = afterOverrides.get(change.id) ?? change.afterText;
      if (change.id === SETTINGS_CHANGE_ID) {
        const proposed = parseSettingsProposal(afterText);
        if (!proposed) {
          result.invalid.push({ change, message: 'Lorebook settings must be valid JSON.' });
          continue;
        }
        if (stableSerialize(settingsOf(baselineBook)) !== stableSerialize(settingsOf(live))) {
          result.conflicts.push({
            change,
            message: 'Lorebook settings changed while the agent was working.',
          });
          continue;
        }
        planned.push({ change });
        continue;
      }

      const id = Number(change.id.slice('book:entry:'.length));
      const before = entryOf(baselineBook, id);
      if (afterText.trim() === '') {
        if (!before) {
          result.invalid.push({ change, message: 'Cannot delete an entry that does not exist.' });
          continue;
        }
        if (stableSerialize(entryOf(live, id)) !== stableSerialize(before)) {
          result.conflicts.push({
            change,
            message: `Entry #${id} changed while the agent was working.`,
          });
          continue;
        }
        planned.push({ change, entry: null });
        continue;
      }
      const proposed = parseEntryProposal(id, afterText);
      if (proposed === undefined) {
        result.invalid.push({
          change,
          message: 'Entry proposal must be valid JSON with the entry id, keys, and content.',
        });
        continue;
      }
      if (before && stableSerialize(entryOf(live, id)) !== stableSerialize(before)) {
        result.conflicts.push({
          change,
          message: `Entry #${id} changed while the agent was working.`,
        });
        continue;
      }
      planned.push({ change, entry: proposed });
    }
    if (result.conflicts.length > 0 || result.invalid.length > 0) {
      return result;
    }
    result.applied = planned.map((item) => item.change);
    let committedBook = cloneChangeValue(live);
    for (const item of planned) {
      if (item.change.id === SETTINGS_CHANGE_ID) {
        const proposed = parseSettingsProposal(
          afterOverrides.get(item.change.id) ?? item.change.afterText,
        );
        if (proposed) Object.assign(committedBook, proposed);
        continue;
      }
      const id = Number(item.change.id.slice('book:entry:'.length));
      committedBook = replaceEntry(committedBook, id, item.entry ?? null);
    }

    await io.takeSnapshot?.();
    await io.setBook(committedBook);
    for (const change of result.applied) afterOverrides.delete(change.id);
    book = cloneChangeValue(committedBook);
    baselineBook = cloneChangeValue(committedBook);
    dirty = false;
    return result;
  };

  const host: LorebookAgentHost = {
    toolNames: LOREBOOK_TOOL_NAMES,
    tools: LOREBOOK_TOOL_SPECS,

    buildSystemPrompt(input: { extraChunks: string[]; toolMode?: AgentToolMode }): string {
      return buildLorebookAgentSystemPrompt(input.extraChunks, input.toolMode ?? 'native');
    },

    async extraContextChunks(): Promise<string[]> {
      if (cachedCustomChunk === undefined) {
        const custom = await io.getCustomContext();
        cachedCustomChunk = custom ? formatCustomContextChunk(custom) : null;
      }
      const chunks: string[] = [];
      if (cachedCustomChunk) chunks.push(cachedCustomChunk);
      chunks.push(formatEntryCatalog(book));
      return chunks;
    },

    async execute(action: ParsedAction): Promise<ActionResult> {
      if (action.name === 'list_entries') return listEntries(book);
      if (action.name === 'read_entry') {
        const parsedId = parseEntryId(action.headers.id);
        if (parsedId != null) {
          const cached = entryReadCache.get(parsedId);
          if (cached != null) return { ok: true, toolName: 'read_entry', message: cached };
        }
        const result = readEntry(book, action);
        if (result.ok && parsedId != null) cacheEntryRead(parsedId, result.message);
        return result;
      }
      if (action.name === 'add_entry') {
        const existing = findEntryByName(book.entries ?? [], entryDisplayName(action));
        const revisable = existing != null && revisableIds.has(existing.id);
        if (!revisable && addedThisRun >= maxNewEntries) {
          return {
            ok: false,
            toolName: 'add_entry',
            message: `limit: max ${maxNewEntries} new entries per run`,
          };
        }
        const applied = addEntry(book, action, revisableIds);
        if (!applied.result.ok) return applied.result;
        if (applied.entryId != null) revisableIds.add(applied.entryId);
        if (applied.created) addedThisRun += 1;
        if (applied.changed) {
          book = applied.book;
          dirty = true;
          if (applied.entryId != null) cacheBookEntry(applied.entryId);
        }
        return applied.result;
      }
      if (action.name === 'update_entry') {
        if (updatedThisRun >= MAX_UPDATES_PER_RUN) {
          return {
            ok: false,
            toolName: 'update_entry',
            message: `limit: max ${MAX_UPDATES_PER_RUN} updates per run`,
          };
        }
        const applied = updateEntry(book, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          book = applied.book;
          dirty = true;
          updatedThisRun += 1;
        }
        if (applied.entry) cacheEntryRead(applied.entry.id, formatEntryRead(applied.entry));
        return applied.result;
      }
      if (action.name === 'replace_in_entry') {
        if (updatedThisRun >= MAX_UPDATES_PER_RUN) {
          return {
            ok: false,
            toolName: 'replace_in_entry',
            message: `limit: max ${MAX_UPDATES_PER_RUN} updates per run`,
          };
        }
        const applied = replaceInEntry(book, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          book = applied.book;
          dirty = true;
          updatedThisRun += 1;
        }
        if (applied.entry) cacheEntryRead(applied.entry.id, formatEntryRead(applied.entry));
        return applied.result;
      }
      if (action.name === 'search') return searchBook(book, action);
      if (action.name === 'audit_book') return auditBook(book);
      if (action.name === 'read_recursion') return readRecursion(book, action);
      if (action.name === 'replace_across') {
        if (replaceAcrossThisRun >= MAX_REPLACE_ACROSS_PER_RUN) {
          return {
            ok: false,
            toolName: 'replace_across',
            message: `limit: max ${MAX_REPLACE_ACROSS_PER_RUN} replace_across calls per run`,
          };
        }
        const applied = replaceAcrossBook(book, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          book = applied.book;
          dirty = true;
          replaceAcrossThisRun += 1;
          entryReadCache.clear();
        }
        return applied.result;
      }
      if (action.name === 'update_book_settings') {
        if (updatedThisRun >= MAX_UPDATES_PER_RUN) {
          return {
            ok: false,
            toolName: 'update_book_settings',
            message: `limit: max ${MAX_UPDATES_PER_RUN} updates per run`,
          };
        }
        const applied = updateBookSettings(book, action);
        if (!applied.result.ok) return applied.result;
        if (applied.changed) {
          book = applied.book;
          dirty = true;
          updatedThisRun += 1;
        }
        return applied.result;
      }
      if (action.name === 'delete_entry') {
        if (deletedThisRun >= MAX_DELETES_PER_RUN) {
          return {
            ok: false,
            toolName: 'delete_entry',
            message: `limit: max ${MAX_DELETES_PER_RUN} deletes per run`,
          };
        }
        const applied = deleteEntry(book, action);
        if (!applied.result.ok) return applied.result;
        book = applied.book;
        dirty = true;
        deletedThisRun += 1;
        if (applied.entryId != null) {
          entryReadCache.delete(applied.entryId);
          revisableIds.delete(applied.entryId);
        }
        return applied.result;
      }
      return { ok: false, toolName: action.name, message: `unknown_action: ${action.name}` };
    },

    peekBook(): CharacterBook {
      return book;
    },

    applyBook(next: CharacterBook): void {
      book = cloneChangeValue(next);
      dirty = true;
      entryReadCache.clear();
    },

    getPendingChanges,

    updatePendingChange(update): boolean {
      if (!getPendingChanges().some((change) => change.id === update.id)) return false;
      afterOverrides.set(update.id, update.afterText);
      return true;
    },

    discardPendingChanges(): void {
      afterOverrides.clear();
      book = cloneChangeValue(baselineBook);
      dirty = false;
      entryReadCache.clear();
    },

    async commitPendingChanges(selectedIds?: ReadonlySet<string>) {
      return commitPendingChanges(selectedIds);
    },

    async flush(): Promise<void> {
      if (!dirty && afterOverrides.size === 0) return;
      if (afterOverrides.size > 0) {
        await commitPendingChanges();
        return;
      }
      await io.takeSnapshot?.();
      await io.setBook(book);
      baselineBook = cloneChangeValue(book);
      dirty = false;
    },
  };

  return host;
}
