import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const { table, transaction } = vi.hoisted(() => ({
  table: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/db/CharacterDatabase', () => ({
  characterDb: { table, transaction },
}));

import { isEncryptedBackup, VaultBackupService } from '../../src/services/VaultBackupService';

const tableNames = [
  'characters', 'snapshots', 'snapshotIndex', 'settings', 'storedImages',
  'spellDictionaryCache', 'characterListIndex', 'characterCustomContext',
  'lorebookCustomContext', 'lorebooks', 'lorebookListIndex', 'lorebookSnapshots',
  'lorebookSnapshotIndex', 'characterLorebookAttachments', 'chatMessages',
] as const;

function makeTables(rowsByName: Record<string, unknown[]> = {}) {
  const tables = new Map<string, {
    clear: ReturnType<typeof vi.fn>;
    bulkPut: ReturnType<typeof vi.fn>;
    toArray: ReturnType<typeof vi.fn>;
  }>();
  for (const name of tableNames) {
    tables.set(name, {
      clear: vi.fn(),
      bulkPut: vi.fn(),
      toArray: vi.fn().mockResolvedValue(rowsByName[name] ?? []),
    });
  }
  table.mockImplementation((name: string) => tables.get(name));
  return tables;
}

describe('VaultBackupService', () => {
  it('exports only character tables for the Characters only option', async () => {
    makeTables();

    const archive = await new VaultBackupService().exportBackup('characters');
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      option: string;
      tables: string[];
    };

    expect(manifest.option).toBe('characters');
    expect(manifest.tables).toEqual([
      'characters', 'snapshots', 'snapshotIndex', 'storedImages',
      'characterListIndex', 'characterCustomContext', 'chatMessages',
    ]);
    expect(zip.file('lorebooks.json')).toBeNull();
    expect(zip.file('settings.json')).toBeNull();
    expect(zip.file('chatMessages.json')).not.toBeNull();
  });

  it('redacts active and per-endpoint API keys from the safe backup', async () => {
    makeTables({
      settings: [{
        id: 'app-settings',
        ai: {
          apiKey: 'active-secret',
          apiKeysByBaseUrl: { 'https://example.test': 'saved-secret' },
          modelId: 'model',
        },
      }],
    });

    const archive = await new VaultBackupService().exportBackup('everything-without-api-keys');
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const settings = JSON.parse(await zip.file('settings.json')!.async('string')) as Array<{
      ai: { apiKey: string; apiKeysByBaseUrl: Record<string, string> };
    }>;

    expect(settings[0]?.ai).toMatchObject({ apiKey: '', apiKeysByBaseUrl: {} });
  });

  it('returns an encrypted backup that is not a readable ZIP', async () => {
    makeTables();

    const archive = await new VaultBackupService().exportBackup('encrypted', 'test passphrase');

    await expect(isEncryptedBackup(archive)).resolves.toBe(true);
    await expect(JSZip.loadAsync(archive)).rejects.toThrow();
  });

  it('accepts valid context and attachment rows keyed by owner id', async () => {
    const tables = makeTables();
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
