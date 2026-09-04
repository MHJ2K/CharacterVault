import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const { table, transaction } = vi.hoisted(() => ({
  table: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/db/CharacterDatabase', () => ({
  characterDb: { table, transaction },
}));

import { VaultBackupService } from '../../src/services/VaultBackupService';

const tableNames = [
  'characters', 'snapshots', 'snapshotIndex', 'settings', 'storedImages',
  'spellDictionaryCache', 'characterListIndex', 'characterCustomContext',
  'lorebookCustomContext', 'lorebooks', 'lorebookListIndex', 'lorebookSnapshots',
  'lorebookSnapshotIndex', 'characterLorebookAttachments', 'chatMessages',
] as const;

describe('VaultBackupService.restoreBackup', () => {
  it('accepts valid context and attachment rows keyed by owner id', async () => {
    const tables = new Map<string, { clear: ReturnType<typeof vi.fn>; bulkPut: ReturnType<typeof vi.fn> }>();
    for (const name of tableNames) {
      tables.set(name, { clear: vi.fn(), bulkPut: vi.fn() });
    }
    table.mockImplementation((name: string) => tables.get(name));
    transaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      format: 'character-vault-backup',
      version: 1,
      exportedAt: '2020-01-01T00:00:00.000Z',
      tables: tableNames,
    }));
    for (const name of tableNames) {
      const rows = name === 'characterCustomContext'
        ? [{ characterId: 'char-1', content: 'Notes', enabled: true, updatedAt: '2020-01-01T00:00:00.000Z', charLength: 5 }]
        : name === 'lorebookCustomContext'
          ? [{ lorebookId: 'book-1', content: 'Notes', enabled: true, updatedAt: '2020-01-01T00:00:00.000Z', charLength: 5 }]
          : name === 'characterLorebookAttachments'
            ? [{ characterId: 'char-1', lorebookIds: ['book-1'], updatedAt: '2020-01-01T00:00:00.000Z' }]
            : [];
      zip.file(`${name}.json`, JSON.stringify(rows));
    }

    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(
      new VaultBackupService().restoreBackup(archive as unknown as Blob),
    ).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tables.get('characterCustomContext')?.bulkPut).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ characterId: 'char-1' }),
    ]));
    expect(tables.get('lorebookCustomContext')?.bulkPut).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ lorebookId: 'book-1' }),
    ]));
    expect(tables.get('characterLorebookAttachments')?.bulkPut).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ characterId: 'char-1' }),
    ]));
  });
});
