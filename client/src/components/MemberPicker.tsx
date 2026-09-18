import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useHousehold } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { Sheet } from './Sheet';
import { Avatar, Button, Field, Input, cx } from './ui';
import type { Member } from '@shared/types';

/**
 * "Who is using this device?" Remembered locally. People who added a password
 * are asked for it once per device. With `required`, the sheet cannot be closed
 * until someone is chosen.
 */
export function MemberPicker({ open, onClose, required = false }: { open: boolean; onClose: () => void; required?: boolean }) {
  const { data } = useHousehold();
  const { memberId } = usePrefs();
  const [locked, setLocked] = useState<Member | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = (m: Member) => {
    if (m.has_password) {
      setLocked(m);
      setPassword('');
      setError('');
      return;
    }
    setPrefs({ memberId: m.id, unlockToken: null });
    onClose();
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locked) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.unlock(locked.id, password);
      setPrefs({ memberId: locked.id, unlockToken: r.token });
      setLocked(null);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (locked) return setLocked(null);
    if (!required) onClose();
  };

  return (
    <Sheet open={open} onClose={close} dismissable={!required || !!locked} title={locked ? `Hi ${locked.name}` : "Who's this?"}>
      {locked ? (
        <form className="form" onSubmit={unlock}>
          <div className="row">
            <Avatar member={locked} size="lg" />
            <p className="muted">This profile is protected. Enter the password once and this device remembers it.</p>
          </div>
          <Field label="Password">
            <Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <Button variant="ghost" onClick={() => setLocked(null)}>Back</Button>
            <Button variant="primary" type="submit" className="right" disabled={!password || busy}>Unlock</Button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            {required ? 'Pick yourself so Lar can show what is yours.' : 'Lar remembers your choice on this device so lists can show what is yours.'}
          </p>
          <div className="member-list">
            {data?.members.map((m) => (
              <button key={m.id} type="button" className={cx('member-option', m.id === memberId && 'on')} onClick={() => choose(m)}>
                <Avatar member={m} size="lg" />
                <span className="grow">
                  <b>{m.name}</b>
                  {m.id === memberId && <small>This is you</small>}
                </span>
                {m.has_password && <Lock size={16} className="faint" aria-label="Password protected" />}
              </button>
            ))}
          </div>
          {!required && (
            <p className="faint" style={{ marginTop: 14, fontSize: 13 }}>
              Someone missing?{' '}
              <Link to="/household" onClick={onClose} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Manage household
              </Link>
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
