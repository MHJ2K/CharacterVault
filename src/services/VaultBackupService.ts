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
const ENCRYPTED_HEADER = 'CharacterVaultEncryptedBackupV1\n';
const ENCRYPTED_HEADER_BYTES = new TextEncoder().encode(ENCRYPTED_HEADER);
const ENCRYPTED_SALT_LENGTH = 16;
const ENCRYPTED_IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 250_000;

export type VaultBackupOption =
  | 'characters'
  | 'characters-lorebooks'
  | 'everything'
  | 'everything-without-api-keys'
  | 'encrypted';

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

type BackupTableName = keyof BackupTables;

export interface VaultBackupManifest {
  format: 'character-vault-backup';
  version: number;
  exportedAt: string;
  tables: BackupTableName[];
  option?: VaultBackupOption;
}

const tableNames: BackupTableName[] = [
  'characters', 'snapshots', 'snapshotIndex', 'settings', 'storedImages',
  'spellDictionaryCache', 'characterListIndex', 'characterCustomContext',
  'lorebookCustomContext', 'lorebooks', 'lorebookListIndex', 'lorebookSnapshots',
  'lorebookSnapshotIndex', 'characterLorebookAttachments', 'chatMessages',
];

const characterTableNames: BackupTableName[] = [
  'characters', 'snapshots', 'snapshotIndex', 'storedImages',
  'characterListIndex', 'characterCustomContext', 'chatMessages',
];

const lorebookTableNames: BackupTableName[] = [
  'lorebooks', 'lorebookListIndex', 'lorebookSnapshots', 'lorebookSnapshotIndex',
  'lorebookCustomContext', 'characterLorebookAttachments',
];

const characterAndLorebookTableNames: BackupTableName[] = [
  ...characterTableNames,
  ...lorebookTableNames,
  'chatMessages',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasIdentity(row: Record<string, unknown>, tableName: BackupTableName): boolean {
  const key = tableName === 'characterCustomContext'
    ? 'characterId'
    : tableName === 'lorebookCustomContext'
      ? 'lorebookId'
      : tableName === 'characterLorebookAttachments'
        ? 'characterId'
        : 'id';
  return typeof row[key] === 'string' && row[key].length > 0;
}

function validateRows(tableName: BackupTableName, rows: unknown[]): void {
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

function tableNamesForOption(option: VaultBackupOption): BackupTableName[] {
  if (option === 'characters') return characterTableNames;
  if (option === 'characters-lorebooks' || option === 'everything-without-api-keys') {
    return option === 'characters-lorebooks' ? characterAndLorebookTableNames : tableNames;
  }
  return tableNames;
}

function filterRows(tableName: BackupTableName, rows: unknown[], option: VaultBackupOption): unknown[] {
  if (tableName !== 'chatMessages' || option !== 'characters') return rows;
  return rows.filter((row) => isRecord(row) && row.ownerType === 'character');
}

function withoutApiKeys(row: unknown): unknown {
  if (!isRecord(row) || !isRecord(row.ai)) return row;
  return {
    ...row,
    ai: {
      ...row.ai,
      apiKey: '',
      apiKeysByBaseUrl: {},
    },
  };
}

function redactRows(tableName: BackupTableName, rows: unknown[], option: VaultBackupOption): unknown[] {
  if (option !== 'everything-without-api-keys' || tableName !== 'settings') return rows;
  return rows.map(withoutApiKeys);
}

async function rowsForRestore(
  tableName: BackupTableName,
  importedRows: unknown[],
  option: VaultBackupOption | undefined,
): Promise<unknown[]> {
  if (tableName !== 'chatMessages' || option !== 'characters') return importedRows;

  const existingRows = await characterDb.table(tableName).toArray();
  return [
    ...existingRows.filter((row: unknown) => isRecord(row) && row.ownerType !== 'character'),
    ...importedRows,
  ];
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('This browser does not support encrypted backups.');
  }
  return globalThis.crypto;
}

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function hasHeader(bytes: Uint8Array): boolean {
  if (bytes.length < ENCRYPTED_HEADER_BYTES.length) return false;
  return ENCRYPTED_HEADER_BYTES.every((byte, index) => bytes[index] === byte);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

async function deriveEncryptionKey(passphrase: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

async function readBytes(value: Blob | Uint8Array): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return new Uint8Array(await value.arrayBuffer());
}

async function encryptArchive(archive: Blob, passphrase: string): Promise<Blob> {
  if (!passphrase.trim()) throw new Error('A passphrase is required for encrypted backups.');
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTED_SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTED_IV_LENGTH));
  const key = await deriveEncryptionKey(passphrase, salt, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(await readBytes(archive)),
  );
  return new Blob([toArrayBuffer(concatenateBytes(ENCRYPTED_HEADER_BYTES, salt, iv, new Uint8Array(encrypted)))], {
    type: 'application/octet-stream',
  });
}

async function decryptArchive(blob: Blob, passphrase: string): Promise<Blob> {
  if (!passphrase.trim()) throw new Error('A passphrase is required to restore this backup.');
  const bytes = await readBytes(blob);
  const payloadStart = ENCRYPTED_HEADER_BYTES.length;
  const minimumLength = payloadStart + ENCRYPTED_SALT_LENGTH + ENCRYPTED_IV_LENGTH + 1;
  if (!hasHeader(bytes) || bytes.length < minimumLength) {
    throw new Error('Invalid encrypted CharacterVault backup.');
  }

  const saltStart = payloadStart;
  const ivStart = saltStart + ENCRYPTED_SALT_LENGTH;
  const encryptedStart = ivStart + ENCRYPTED_IV_LENGTH;
  const salt = bytes.slice(saltStart, ivStart);
  const iv = bytes.slice(ivStart, encryptedStart);
  const encrypted = bytes.slice(encryptedStart);

  try {
    const crypto = getCrypto();
    const key = await deriveEncryptionKey(passphrase, salt, ['decrypt']);
    const archive = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(new Uint8Array(encrypted)),
    );
    return new Blob([archive], { type: 'application/zip' });
  } catch {
    throw new Error('Unable to decrypt backup. Check the passphrase.');
  }
}

export async function isEncryptedBackup(blob: Blob): Promise<boolean> {
  const bytes = (await readBytes(blob)).slice(0, ENCRYPTED_HEADER_BYTES.length);
  return hasHeader(bytes);
}

export class VaultBackupService {
  async exportBackup(option: VaultBackupOption = 'everything', passphrase?: string): Promise<Blob> {
    const zip = new JSZip();
    const encrypted = option === 'encrypted';
    const tableOption = encrypted ? 'everything' : option;
    const selectedTables = tableNamesForOption(tableOption);
    const manifest: VaultBackupManifest = {
      format: 'character-vault-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: selectedTables,
      option,
    };
    zip.file(MANIFEST, JSON.stringify(manifest, null, 2));
    for (const tableName of selectedTables) {
      const rows = await characterDb.table(tableName).toArray();
      const scopedRows = filterRows(tableName, rows, tableOption);
      zip.file(`${tableName}.json`, JSON.stringify(redactRows(tableName, scopedRows, tableOption)));
    }

    const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return encrypted ? encryptArchive(archive, passphrase ?? '') : archive;
  }

  async restoreBackup(blob: Blob, passphrase?: string): Promise<void> {
    const archive = await isEncryptedBackup(blob) ? await decryptArchive(blob, passphrase ?? '') : blob;
    const zip = await JSZip.loadAsync(archive);
    const manifestEntry = zip.file(MANIFEST);
    if (!manifestEntry) throw new Error('Invalid backup: missing manifest.');
    const manifest: unknown = JSON.parse(await manifestEntry.async('string'));
    if (!isRecord(manifest) || manifest.format !== 'character-vault-backup' || manifest.version !== BACKUP_VERSION) {
      throw new Error('Unsupported or invalid CharacterVault backup.');
    }

    const manifestTables = manifest.tables;
    const manifestOption = manifest.option as VaultBackupOption | undefined;
    if (
      !Array.isArray(manifestTables) ||
      manifestTables.length === 0 ||
      manifestTables.some((name) => !tableNames.includes(name as BackupTableName)) ||
      new Set(manifestTables).size !== manifestTables.length
    ) {
      throw new Error('Invalid backup: invalid table list.');
    }
    const selectedTables = manifestTables as BackupTableName[];
    const imported = {} as Partial<BackupTables>;
    for (const tableName of selectedTables) {
      const entry = zip.file(`${tableName}.json`);
      if (!entry) throw new Error(`Invalid backup: missing ${tableName}.`);
      const rows: unknown = JSON.parse(await entry.async('string'));
      if (!Array.isArray(rows)) throw new Error(`Invalid backup: ${tableName} is not an array.`);
      validateRows(tableName, rows);
      imported[tableName] = rows as never;
    }

    await characterDb.transaction('rw', selectedTables.map((name) => characterDb.table(name)), async () => {
      for (const tableName of selectedTables) {
        const table = characterDb.table(tableName);
        const rows = await rowsForRestore(tableName, imported[tableName] ?? [], manifestOption);
        await table.clear();
        await table.bulkPut(rows);
      }
    });
  }

  filename(option: VaultBackupOption = 'everything'): string {
    const date = new Date().toISOString().slice(0, 10);
    if (option === 'encrypted') return `character-vault-encrypted-backup-${date}.cvb`;
    if (option === 'characters') return `character-vault-characters-backup-${date}.zip`;
    if (option === 'characters-lorebooks') return `character-vault-content-backup-${date}.zip`;
    if (option === 'everything-without-api-keys') return `character-vault-safe-backup-${date}.zip`;
    return `character-vault-full-backup-${date}.zip`;
  }
}

export const vaultBackupService = new VaultBackupService();
