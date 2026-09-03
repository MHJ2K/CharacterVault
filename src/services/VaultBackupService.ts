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

export class VaultBackupService {
  async exportBackup(): Promise<Blob> {
    const zip = new JSZip();
    const tables = {} as BackupTables;
    for (const tableName of tableNames) {
      tables[tableName] = await characterDb.table(tableName).toArray() as never;
    }

    const manifest: VaultBackupManifest = {
      format: 'character-vault-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: tableNames,
    };
    zip.file(MANIFEST, JSON.stringify(manifest, null, 2));
    for (const tableName of tableNames) {
      zip.file(`${tableName}.json`, JSON.stringify(tables[tableName]));
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
