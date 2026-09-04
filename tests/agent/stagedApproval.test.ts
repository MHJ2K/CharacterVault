import { describe, expect, it, vi } from 'vitest';
import { runLoop } from '../../src/agent/core/runLoop';
import type { AgentPendingChange } from '../../src/agent/core/changes';
import type {
  AgentHost,
  AgentMessage,
  CompleterResult,
} from '../../src/agent/core/types';
import { createLorebookHost } from '../../src/agent/hosts/lorebook/createHost';
import { createCharacterHost, type CharacterHostPersist } from '../../src/agent/hosts/character/createHost';
import type { CharacterBook, CharacterSpec } from '../../src/db/characterTypes';
import { createEmptyCharacterBook } from '../../src/db/characterTypes';

function action(name: string, headers: Record<string, string> = {}, body = '') {
  return { name, headers, body };
}

function characterSpec(overrides: Partial<CharacterSpec> = {}): CharacterSpec {
  return {
    name: 'Aria',
    description: 'A cartographer.',
    personality: 'Quiet.',
    scenario: 'A rain-soaked port.',
    first_mes: 'Hello.',
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    physical_description: '',
    ...overrides,
  };
}

function scriptedComplete(replies: Array<string | CompleterResult>): (messages: AgentMessage[]) => Promise<CompleterResult> {
  let index = 0;
  return async () => {
    const reply = replies[index] ?? 'done';
    index += 1;
    return typeof reply === 'string' ? { content: reply } : reply;
  };
}

describe('runLoop staged pause', () => {
  it('returns pending changes instead of flushing when the host has staged edits', async () => {
    const flush = vi.fn(async () => undefined);
    const pending: AgentPendingChange[] = [
      {
        id: 'spec:description',
        label: 'Card field: description',
        target: 'field:description',
        beforeText: 'A cartographer.',
        afterText: 'A careful cartographer.',
        valueType: 'text',
      },
    ];
    const host: AgentHost = {
      toolNames: [],
      buildSystemPrompt: () => 'sys',
      extraContextChunks: async () => [],
      execute: async () => ({ ok: true, toolName: 'x', message: 'ok x' }),
      flush,
      getPendingChanges: () => pending,
      discardPendingChanges: () => undefined,
    };
    const result = await runLoop({
      host,
      complete: scriptedComplete(['The draft is ready for review.']),
      userMessage: 'rewrite the description',
    });
    expect(result.reason).toBe('complete');
    expect(result.pendingChanges).toEqual(pending);
    expect(flush).not.toHaveBeenCalled();
  });

  it('flushes as before when there are no staged changes', async () => {
    const flush = vi.fn(async () => undefined);
    const host: AgentHost = {
      toolNames: [],
      buildSystemPrompt: () => 'sys',
      extraContextChunks: async () => [],
      execute: async () => ({ ok: true, toolName: 'x', message: 'ok x' }),
      flush,
    };
    const result = await runLoop({
      host,
      complete: scriptedComplete(['Done.']),
      userMessage: 'check the card',
    });
    expect(result.reason).toBe('complete');
    expect(result.pendingChanges).toBeUndefined();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('lorebook host staged approval', () => {
  function makeIo() {
    const state = { book: createEmptyCharacterBook('World') };
    const setBook = vi.fn(async (next: CharacterBook) => {
      state.book = next;
    });
    const takeSnapshot = vi.fn(async () => undefined);
    return {
      state,
      setBook,
      takeSnapshot,
      getBook: () => state.book,
    };
  }

  it('stages add_entry and update_book_settings without touching the live book', async () => {
    const io = makeIo();
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    await host.execute(action('update_book_settings', { scan_depth: '4', token_budget: '512' }));
    expect(io.setBook).not.toHaveBeenCalled();
    expect(io.state.book.entries).toHaveLength(0);
    const pending = host.getPendingChanges?.() ?? [];
    expect(pending.length).toBeGreaterThanOrEqual(2);
    const entryChange = pending.find((change) => change.id === 'book:entry:0');
    expect(entryChange).toBeDefined();
    expect(entryChange?.beforeText).toBe('');
    expect(entryChange?.afterText).toContain('A busy harbor.');
    const settingsChange = pending.find((change) => change.id === 'book:settings');
    expect(settingsChange).toBeDefined();
    expect(settingsChange?.afterText).toContain('"scan_depth": 4');
  });

  it('commits the full batch atomically on approval with one snapshot', async () => {
    const io = makeIo();
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    await host.execute(action('update_book_settings', { scan_depth: '4' }));
    const result = await host.commitPendingChanges?.();
    expect(result?.conflicts).toHaveLength(0);
    expect(result?.invalid).toHaveLength(0);
    expect(result?.applied).toHaveLength(2);
    expect(io.setBook).toHaveBeenCalledTimes(1);
    expect(io.takeSnapshot).toHaveBeenCalledTimes(1);
    expect(io.state.book.entries).toHaveLength(1);
    expect(io.state.book.entries[0].content).toContain('A busy harbor.');
    expect(io.state.book.scan_depth).toBe(4);
    expect(host.getPendingChanges?.()).toHaveLength(0);
  });

  it('applies only the selected change ids and drops the unselected draft', async () => {
    const io = makeIo();
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    await host.execute(action('update_book_settings', { scan_depth: '4' }));
    const result = await host.commitPendingChanges?.(new Set(['book:entry:0']));
    expect(result?.applied.map((change) => change.id)).toEqual(['book:entry:0']);
    expect(io.state.book.entries).toHaveLength(1);
    expect(io.state.book.scan_depth).toBeUndefined();
    expect(host.getPendingChanges?.()).toHaveLength(0);
  });

  it('rejects the whole batch when the live book was edited while the agent worked', async () => {
    const io = makeIo();
    io.state.book.entries = [
      {
        id: 4,
        keys: ['keep'],
        content: 'A quiet castle.',
        extensions: {},
        enabled: true,
        name: 'The Red Keep',
      },
    ];
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(
      action('update_entry', { id: '4' }, 'The Red Keep is the royal castle.'),
    );
    expect(io.setBook).not.toHaveBeenCalled();
    io.state.book.entries[0].content = 'USER-EDITED LIVE CONTENT';
    const result = await host.commitPendingChanges?.();
    expect(result?.applied).toHaveLength(0);
    expect(result?.conflicts.length).toBeGreaterThan(0);
    expect(io.setBook).not.toHaveBeenCalled();
    expect(host.getPendingChanges?.()).not.toHaveLength(0);
  });

  it('honors edited proposal text on approval', async () => {
    const io = makeIo();
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    const entry = (host.getPendingChanges?.() ?? []).find((change) => change.id === 'book:entry:0');
    expect(entry).toBeDefined();
    const edited = JSON.parse(entry!.afterText) as { content: string };
    edited.content = 'A quiet fishing village.';
    const ok = host.updatePendingChange?.({ id: 'book:entry:0', afterText: JSON.stringify(edited) });
    expect(ok).toBe(true);
    const result = await host.commitPendingChanges?.();
    expect(result?.applied).toHaveLength(1);
    expect(io.state.book.entries[0].content).toBe('A quiet fishing village.');
  });

  it('records the committed changes as applied and clears the pending list', async () => {
    const io = makeIo();
    const host = createLorebookHost({
      getBook: io.getBook,
      setBook: io.setBook,
      getCustomContext: async () => null,
      takeSnapshot: io.takeSnapshot,
    });
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    const result = await host.commitPendingChanges?.();
    expect(result?.applied).toHaveLength(1);
    expect(result?.conflicts).toHaveLength(0);
    expect(io.state.book.entries).toHaveLength(1);
    expect(host.getPendingChanges?.()).toHaveLength(0);
  });
});

describe('character host staged approval', () => {
  function makeState() {
    const state = {
      card: characterSpec(),
      book: createEmptyCharacterBook('Aria'),
    };
    const persist = vi.fn(async (update: CharacterHostPersist) => {
      if (update.spec) state.card = update.spec;
      if (update.book) state.book = update.book;
    });
    const takeSnapshot = vi.fn(async () => undefined);
    return {
      state,
      persist,
      takeSnapshot,
      getSpec: () => state.card,
      getBook: () => state.book,
      getCustomContext: async () => null as string | null,
    };
  }

  it('stages spec field changes and embedded book changes together', async () => {
    const state = makeState();
    const host = createCharacterHost({
      getSpec: state.getSpec,
      getBook: state.getBook,
      persist: state.persist,
      getCustomContext: state.getCustomContext,
      takeSnapshot: state.takeSnapshot,
    });
    await host.execute(action('update_field', { id: 'description' }, 'A careful cartographer.'));
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    expect(state.persist).not.toHaveBeenCalled();
    const pending = host.getPendingChanges?.() ?? [];
    expect(pending.map((change) => change.id)).toEqual(
      expect.arrayContaining(['spec:description', 'book:entry:0']),
    );
    const desc = pending.find((change) => change.id === 'spec:description');
    expect(desc?.beforeText).toBe('A cartographer.');
    expect(desc?.afterText).toBe('A careful cartographer.');
  });

  it('commits spec and embedded book in one persist with one snapshot', async () => {
    const state = makeState();
    const host = createCharacterHost({
      getSpec: state.getSpec,
      getBook: state.getBook,
      persist: state.persist,
      getCustomContext: state.getCustomContext,
      takeSnapshot: state.takeSnapshot,
    });
    await host.execute(action('update_field', { id: 'description' }, 'A careful cartographer.'));
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    const result = await host.commitPendingChanges?.();
    expect(result?.conflicts).toHaveLength(0);
    expect(result?.invalid).toHaveLength(0);
    expect(result?.applied.map((change) => change.id).sort()).toEqual(['book:entry:0', 'spec:description']);
    expect(state.persist).toHaveBeenCalledTimes(1);
    expect(state.takeSnapshot).toHaveBeenCalledTimes(1);
    expect(state.state.card.description).toBe('A careful cartographer.');
    expect(state.state.book.entries).toHaveLength(1);
    expect(host.getPendingChanges?.()).toHaveLength(0);
  });

  it('rejects the batch when a spec field was edited while the agent worked', async () => {
    const state = makeState();
    const host = createCharacterHost({
      getSpec: state.getSpec,
      getBook: state.getBook,
      persist: state.persist,
      getCustomContext: state.getCustomContext,
      takeSnapshot: state.takeSnapshot,
    });
    await host.execute(action('update_field', { id: 'description' }, 'A careful cartographer.'));
    state.state.card = { ...state.state.card, description: 'A storm-chasing cartographer.' };
    const result = await host.commitPendingChanges?.();
    expect(result?.applied).toHaveLength(0);
    expect(result?.conflicts.length).toBeGreaterThan(0);
    expect(state.persist).not.toHaveBeenCalled();
  });

  it('commits spec and embedded book together and leaves the pending list empty', async () => {
    const state = makeState();
    const host = createCharacterHost({
      getSpec: state.getSpec,
      getBook: state.getBook,
      persist: state.persist,
      getCustomContext: state.getCustomContext,
      takeSnapshot: state.takeSnapshot,
    });
    await host.execute(action('update_field', { id: 'description' }, 'A careful cartographer.'));
    await host.execute(action('add_entry', { name: 'Harbor', keys: 'harbor' }, 'A busy harbor.'));
    const result = await host.commitPendingChanges?.();
    expect(result?.applied).toHaveLength(2);
    expect(result?.conflicts).toHaveLength(0);
    expect(state.state.card.description).toBe('A careful cartographer.');
    expect(state.state.book.entries).toHaveLength(1);
    expect(host.getPendingChanges?.()).toHaveLength(0);
  });
});
