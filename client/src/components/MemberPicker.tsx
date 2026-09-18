import { Link } from 'react-router-dom';
import { useHousehold } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { Sheet } from './Sheet';
import { Avatar, cx } from './ui';

/** "Who is using this device?" Remembered locally, no password. */
export function MemberPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useHousehold();
  const { memberId } = usePrefs();
  return (
    <Sheet open={open} onClose={onClose} title="Who's this?">
      <p className="muted" style={{ marginBottom: 14 }}>
        Homebase remembers your choice on this device so lists can show what's yours.
      </p>
      <div className="member-list">
        {data?.members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={cx('member-option', m.id === memberId && 'on')}
            onClick={() => {
              setPrefs({ memberId: m.id });
              onClose();
            }}
          >
            <Avatar member={m} size="lg" />
            <span className="grow">
              <b>{m.name}</b>
              {m.id === memberId && <small>This is you</small>}
            </span>
          </button>
        ))}
      </div>
      <p className="faint" style={{ marginTop: 14, fontSize: 13 }}>
        Someone missing?{' '}
        <Link to="/household" onClick={onClose} style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Manage household
        </Link>
      </p>
    </Sheet>
  );
}
