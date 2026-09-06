import React, { useRef, useState } from 'react';
import { ChevronDown, Download, KeyRound, ShieldCheck, Upload } from 'lucide-react';
import { saveAs } from 'file-saver';
import { SettingsCard } from '../components/SettingsCard';
import { isEncryptedBackup, vaultBackupService, type VaultBackupOption } from '../../../services/VaultBackupService';
import type { SettingsTabProps } from '../types';

const BACKUP_OPTIONS: Array<{
  id: VaultBackupOption;
  label: string;
  description: string;
  sensitive?: boolean;
}> = [
  {
    id: 'characters',
    label: 'Characters only',
    description: 'Characters, images, and character history.',
  },
  {
    id: 'characters-lorebooks',
    label: 'Characters + lorebooks',
    description: 'Characters, standalone lorebooks, and their history.',
  },
  {
    id: 'everything',
    label: 'Everything',
    description: 'All local records, including settings and chat history.',
    sensitive: true,
  },
  {
    id: 'everything-without-api-keys',
    label: 'Everything except API keys',
    description: 'All local records with API keys removed.',
  },
  {
    id: 'encrypted',
    label: 'Encrypted backup with passphrase',
    description: 'Everything protected by a passphrase.',
  },
];

const RECOMMENDED_OPTION = BACKUP_OPTIONS.find((option) => option.id === 'everything-without-api-keys')!;
const ADVANCED_OPTIONS = BACKUP_OPTIONS.filter((option) => option.id !== RECOMMENDED_OPTION.id);

export const BackupTab: React.FC<SettingsTabProps> = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportBackup = async (option: VaultBackupOption) => {
    let exportPassphrase: string | undefined;
    if (option === 'encrypted') {
      exportPassphrase = window.prompt('Choose a passphrase for this encrypted backup:') ?? undefined;
      if (exportPassphrase === undefined) return;
      if (!exportPassphrase.trim()) {
        setMessage('A passphrase is required for encrypted backups.');
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const blob = await vaultBackupService.exportBackup(option, exportPassphrase);
      saveAs(blob, vaultBackupService.filename(option));
      setMessage(`${BACKUP_OPTIONS.find((item) => item.id === option)?.label ?? 'Backup'} exported successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup export failed.');
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('Restore this backup? Records included in the backup will replace their current local copies.')) return;

    let restorePassphrase: string | undefined;
    try {
      if (await isEncryptedBackup(file)) {
        restorePassphrase = window.prompt('Enter the passphrase for this encrypted backup:') ?? undefined;
        if (restorePassphrase === undefined) return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not inspect backup.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await vaultBackupService.restoreBackup(file, restorePassphrase);
      window.location.href = import.meta.env.BASE_URL;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup restore failed.');
    } finally {
      setBusy(false);
    }
  };

  const renderOptionButton = (option: (typeof BACKUP_OPTIONS)[number], className: string) => (
    <button
      key={option.id}
      type="button"
      onClick={() => void exportBackup(option.id)}
      disabled={busy}
      className={className}
    >
      <span className="mt-0.5 rounded-lg bg-muted p-2 text-accent">
        {option.id === 'encrypted' ? <KeyRound className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{option.label}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{option.description}</span>
        {option.sensitive && <span className="mt-1 block text-xs text-warning">Includes API keys and other sensitive settings.</span>}
      </span>
    </button>
  );

  return (
    <SettingsCard>
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-fg">Vault backups</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Save a copy of your local vault. Not sure what to choose? Use the recommended backup below.
          </p>
        </div>

        <div className="rounded-xl border border-accent/40 bg-accent-soft p-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-surface p-2 text-accent shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-fg">Recommended for most people</h4>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-accent">Safe to store</span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {RECOMMENDED_OPTION.description} Your API keys are left out.
              </p>
              <button
                type="button"
                onClick={() => void exportBackup(RECOMMENDED_OPTION.id)}
                disabled={busy}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download recommended backup
              </button>
            </div>
          </div>
        </div>

        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
            <span>More backup options</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-border p-3">
            {ADVANCED_OPTIONS.map((option) => renderOptionButton(
              option,
              'flex min-h-16 items-start gap-3 rounded-xl border border-border bg-bg px-3 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50',
            ))}
          </div>
        </details>

        <div className="border-t border-border pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-muted disabled:opacity-50">
              <Upload className="h-4 w-4" /> Restore a backup
            </button>
            <span className="text-xs text-fg-muted">Encrypted files ask for their passphrase.</span>
          </div>
          <input ref={inputRef} type="file" accept=".zip,.cvb,application/zip,application/octet-stream" onChange={(event) => void importBackup(event)} className="hidden" />
          <p className="mt-3 text-xs text-fg-muted">Restoring replaces only the record types included in the selected backup.</p>
        </div>

        {message && <p className="text-sm text-fg-muted" role="status">{message}</p>}
        <p className="text-xs text-fg-muted">The encrypted option protects the complete backup with AES-GCM and a passphrase you choose.</p>
      </div>
    </SettingsCard>
  );
};
