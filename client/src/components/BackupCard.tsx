import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { Card, Button } from './ui';
import { Confirm } from './Sheet';
import { useToast } from './Toast';

/** Household page section: download everything as one JSON file, or restore from one. */
export function BackupCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.text });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      toast('Backup restored');
      await qc.invalidateQueries();
    } catch (e) {
      toast((e as Error).message);
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
          Everything in Lar fits in one file. Download it now and then, and keep it somewhere safe. Restoring replaces all current data.
        </p>
        <div className="row wrap">
          <a className="btn btn-secondary" href="/api/v1/backup" download>
            <Download /> Download backup
          </a>
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
                if (parsed.app !== 'lar' && parsed.app !== 'homebase') throw new Error();
              } catch {
                toast('That file is not a Lar backup');
                e.target.value = '';
                return;
              }
              setPending({ name: f.name, text });
            }}
          />
        </div>
      </Card>
      <Confirm open={pending !== null} onClose={() => { setPending(null); if (fileRef.current) fileRef.current.value = ''; }} title="Replace everything with this backup?" body={`All current to-dos, shopping lists, projects, and people will be replaced by the contents of ${pending?.name}.`} confirmLabel="Restore" onConfirm={restore} />
    </>
  );
}
