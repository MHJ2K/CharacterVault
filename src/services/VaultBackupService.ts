import JSZip from 'jszip';
import type {
  Character,
  CharacterCustomContext,
  CharacterLorebookAttachments,
  CharacterSnapshot,
  CharacterVaultSettings,
  LorebookCustomContext,
  LorebookSnapshot,
  SnapshotMetadata,
  StoredChatMessage,
  StoredImage,
  SpellDictionaryCacheEntry,
  VaultLorebook,
  CharacterListItem,
  LorebookListItem,
  LorebookSnapshotMetadata,
} from '../db/characterTypes';
import { characterDb } from '../db/CharacterDatabase';

const BACKUP_VERSION = 1;
const MANIFEST = 'manifest.json';

type BackupTables = {
  characters: Character[];
  snapshots: CharacterSnapshot[];
  snapshotIndex: SnapshotMetadata[];
  settings: CharacterVaultSettings[];
  storedImages: StoredImage[];
  spellDictionaryCache: SpellDictionaryCacheEntry[];
  characterListIndex: CharacterListItem[];
  characterCustomContext: CharacterCustomContext[];
  lorebookCustomContext: LorebookCustomContext[];
  lorebooks: VaultLorebook[];
  lorebookListIndex: LorebookListItem[];
  lorebookSnapshots: LorebookSnapshot[];
  lorebookSnapshotIndex: LorebookSnapshotMetadata[];
  characterLorebookAttachments: CharacterLorebookAttachments[];
  chatMessages: StoredChatMessage[];
};

export interface VaultBackupManifest {
  format: 'character-vault-backup';
  version: number;
  exportedAt: string;
  tables: string[];
}

const tableNames: (keyof BackupTables)[] = [
  'characters', 'snapshots', 'snapshotIndex', 'settings', 'storedImages',
  'spellDictionaryCache', 'characterListIndex', 'characterCustomContext',
  'lorebookCustomContext', 'lorebooks', 'lorebookListIndex', 'lorebookSnapshots',
  'lorebookSnapshotIndex', 'characterLorebookAttachments', 'chatMessages',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasIdentity(row: Record<string, unknown>, tableName: keyof BackupTables): boolean {
  const key = tableName === 'characterCustomContext'
    ? 'characterId'
    : tableName === 'lorebookCustomContext'
      ? 'lorebookId'
      : tableName === 'characterLorebookAttachments'
        ? 'characterId'
        : 'id';
  return typeof row[key] === 'string' && row[key].length > 0;
}

function validateRows(tableName: keyof BackupTables, rows: unknown[]): void {
  for (const row of rows) {
    if (!isRecord(row) || !hasIdentity(row, tableName)) {
      throw new Error(`Invalid backup: ${tableName} contains a row without a primary key.`);
    }

    if (tableName === 'characters' && (!hasString(row, 'name') || !isRecord(row.data))) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid character row.`);
    }
    if (tableName === 'snapshots' && (!hasString(row, 'characterId') || !isRecord(row.payload))) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid snapshot row.`);
    }
    if (tableName === 'snapshotIndex' && !hasString(row, 'characterId')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid index row.`);
    }
    if (tableName === 'lorebooks' && (!hasString(row, 'name') || !isRecord(row.book))) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid lorebook row.`);
    }
    if (tableName === 'lorebookSnapshots' && (!hasString(row, 'lorebookId') || !isRecord(row.payload))) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid snapshot row.`);
    }
    if (tableName === 'lorebookSnapshotIndex' && !hasString(row, 'lorebookId')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid index row.`);
    }
    if (tableName === 'characterListIndex' && !hasString(row, 'name')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid character index row.`);
    }
    if (tableName === 'lorebookListIndex' && !hasString(row, 'name')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid lorebook index row.`);
    }
    if (tableName === 'characterCustomContext' && !hasString(row, 'characterId')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid context row.`);
    }
    if (tableName === 'lorebookCustomContext' && !hasString(row, 'lorebookId')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid context row.`);
    }
    if (tableName === 'characterLorebookAttachments' && !hasString(row, 'characterId')) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid attachment row.`);
    }
    if (tableName === 'chatMessages' && (!hasString(row, 'ownerId') || !hasString(row, 'panel'))) {
      throw new Error(`Invalid backup: ${tableName} contains an invalid message row.`);
    }
  }
}

export class VaultBackupService {
  async exportBackup(): Promise<Blob> {
    const zip = new JSZip();

    const manifest: VaultBackupManifest = {
      format: 'character-vault-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: tableNames,
    };
    zip.file(MANIFEST, JSON.stringify(manifest, null, 2));
    for (const tableName of tableNames) {
      // Keep only one full table and its serialized representation live at a time.
      // Image and snapshot tables can be much larger than the rest of the vault.
      const rows = await characterDb.table(tableName).toArray();
      zip.file(`${tableName}.json`, JSON.stringify(rows));
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  async restoreBackup(blob: Blob): Promise<void> {
    const zip = await JSZip.loadAsync(blob);
    const manifestEntry = zip.file(MANIFEST);
    if (!manifestEntry) throw new Error('Invalid backup: missing manifest.');
    const manifest: unknown = JSON.parse(await manifestEntry.async('string'));
    if (!isRecord(manifest) || manifest.format !== 'character-vault-backup' || manifest.version !== BACKUP_VERSION) {
      throw new Error('Unsupported or invalid CharacterVault backup.');
    }

    const imported = {} as BackupTables;
    for (const tableName of tableNames) {
      const entry = zip.file(`${tableName}.json`);
      if (!entry) throw new Error(`Invalid backup: missing ${tableName}.`);
      const rows: unknown = JSON.parse(await entry.async('string'));
      if (!Array.isArray(rows)) throw new Error(`Invalid backup: ${tableName} is not an array.`);
      validateRows(tableName, rows);
      imported[tableName] = rows as never;
    }

    await characterDb.transaction('rw', tableNames.map((name) => characterDb.table(name)), async () => {
      for (const tableName of tableNames) {
        const table = characterDb.table(tableName);
        await table.clear();
        await table.bulkPut(imported[tableName]);
      }
    });
  }

  filename(): string {
    return `character-vault-full-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  }
}

export const vaultBackupService = new VaultBackupService();
