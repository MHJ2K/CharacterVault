import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { saveAs } from 'file-saver';
import { SettingsCard } from '../components/SettingsCard';
import { vaultBackupService } from '../../../services/VaultBackupService';
import type { SettingsTabProps } from '../types';

export const BackupTab: React.FC<SettingsTabProps> = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportBackup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await vaultBackupService.exportBackup();
      saveAs(blob, vaultBackupService.filename());
      setMessage('Complete backup exported successfully.');
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
    if (!window.confirm('Restore this backup? Existing characters, settings, tags, history, and chats will be replaced.')) return;

    setBusy(true);
    setMessage(null);
    try {
      await vaultBackupService.restoreBackup(file);
      window.location.href = import.meta.env.BASE_URL;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup restore failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-fg">Complete vault backup</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Export or restore every local record in one compressed archive, including characters, images, snapshots, settings, Studio tag categories, lorebooks, and chat history.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void exportBackup()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
            <Download className="h-4 w-4" /> Export complete backup
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-muted disabled:opacity-50">
            <Upload className="h-4 w-4" /> Restore backup
          </button>
          <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={(event) => void importBackup(event)} className="hidden" />
        </div>
        {message && <p className="text-sm text-fg-muted" role="status">{message}</p>}
        <p className="text-xs text-fg-muted">Backups may contain API keys and other sensitive settings. Store them securely.</p>
      </div>
    </SettingsCard>
  );
};
