import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { Card, Button } from './ui';
import { Confirm } from './Sheet';
import { useToast } from './Toast';
import { ApiError, downloadBackup, restoreBackup } from '@/lib/api';
import { today } from '@/lib/format';
import { useCurrentMember } from '@/lib/hooks';

/** A generic 401/403 from the backup endpoints, turned into something a person can act on. */
function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Pick who you are in the sidebar first, then try again.';
    if (e.status === 403) return 'An adult in the household needs to do this.';
    return e.message;
  }
  return (e as Error).message || 'Something went wrong.';
}

/** Settings section: download everything as one JSON file, or restore from one. */
export function BackupCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const me = useCurrentMember();
  const isKid = !!me?.is_kid;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await downloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lar-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.text);
      toast('Backup restored');
      await qc.invalidateQueries();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <Card title="Backup" icon={DatabaseBackup}>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
          Everything in Lar fits in one file. It can contain private calendar links and password hashes, so keep it somewhere safe. Device unlock tokens are never exported. Restoring replaces all current data. Only adults in the household can back up or restore.
        </p>
        {isKid ? (
          <p className="faint" style={{ fontSize: 12.5 }}>Ask an adult to back up or restore Lar.</p>
        ) : (
          <div className="row wrap">
            <Button icon={Download} onClick={download} disabled={busy}>
              Download backup
            </Button>
            <Button icon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>
              Restore from file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                try {
                  const parsed = JSON.parse(text);
                  if (parsed.app !== 'lar') throw new Error();
                } catch {
                  toast('That file is not a Lar backup');
                  e.target.value = '';
                  return;
                }
                setPending({ name: f.name, text });
              }}
            />
          </div>
        )}
      </Card>
      <Confirm open={pending !== null} onClose={() => { setPending(null); if (fileRef.current) fileRef.current.value = ''; }} title="Replace everything with this backup?" body={`All current to-dos, shopping lists, projects, and people will be replaced by the contents of ${pending?.name}.`} confirmLabel="Restore" onConfirm={restore} />
    </>
  );
}
