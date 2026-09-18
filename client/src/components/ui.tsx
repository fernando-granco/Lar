import { Check, Users, type LucideIcon } from 'lucide-react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { Member, Group, Assignees } from '@shared/types';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  block?: boolean;
  icon?: LucideIcon;
};
export function Button({ variant = 'secondary', size = 'md', block, icon: Icon, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', className)} {...rest}>
      {Icon && <Icon />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, danger, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; danger?: boolean }) {
  return (
    <button type="button" className={cx('icon-btn', danger && 'danger', className)} aria-label={label} title={label} {...rest}>
      <Icon />
    </button>
  );
}

export function Chip({ on, icon: Icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; icon?: LucideIcon }) {
  return (
    <button type="button" className={cx('chip', on && 'on')} aria-pressed={on} {...rest}>
      {Icon && <Icon />}
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', icon: Icon, children }: { tone?: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cx('badge', tone)}>
      {Icon && <Icon />}
      {children}
    </span>
  );
}

export function Avatar({ member, size, group }: { member: { name: string; color: string; initials?: string }; size?: 'sm' | 'lg'; group?: boolean }) {
  const initials = member.initials || member.name.slice(0, 2).toUpperCase();
  return (
    <span className={cx('avatar', size, group && 'group')} style={{ background: member.color }} title={member.name}>
      {initials}
    </span>
  );
}

export function AvatarStack({ assignees, members, groups, size = 'sm', showEveryone = true }: { assignees: Assignees; members: Member[]; groups: Group[]; size?: 'sm' | 'lg'; showEveryone?: boolean }) {
  const ms = members.filter((m) => assignees.member_ids.includes(m.id));
  const gs = groups.filter((g) => assignees.group_ids.includes(g.id));
  if (!ms.length && !gs.length) {
    if (!showEveryone) return null;
    return (
      <span className="avatar-stack">
        <span className="everyone">
          <Users /> Everyone
        </span>
      </span>
    );
  }
  return (
    <span className="avatar-stack" title={[...gs.map((g) => g.name), ...ms.map((m) => m.name)].join(', ')}>
      {gs.map((g) => (
        <Avatar key={`g${g.id}`} member={{ name: g.name, color: g.color, initials: g.name.slice(0, 2).toUpperCase() }} size={size} group />
      ))}
      {ms.map((m) => (
        <Avatar key={m.id} member={m} size={size} />
      ))}
    </span>
  );
}

export function CheckBox({ on, round, onToggle, label }: { on: boolean; round?: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label ?? (on ? 'Mark as not done' : 'Mark as done')}
      className={cx('check', on && 'on', round && 'round')}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Check />
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      <span>
        {label} {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('select', p.className)} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx('textarea', p.className)} />;

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function Progress({ value, max = 100, tone }: { value: number; max?: number; tone?: 'over' | 'warn' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx('progress', tone)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({ title, icon: Icon, action, children, className, flush }: { title?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {title && (
        <header className="card-head">
          {Icon && (
            <span className="icon-badge">
              <Icon />
            </span>
          )}
          <h2 className="grow">{title}</h2>
          {action}
        </header>
      )}
      <div className={cx('card-body', flush && 'flush')}>{children}</div>
    </section>
  );
}

export const PALETTE = ['#345a51', '#db744f', '#7c6f9b', '#c8913a', '#3f6f9e', '#a4494f', '#5e8f5a', '#8a6b4e', '#2f7f8f', '#b05a8a'];

export function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-dots" role="radiogroup">
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={c} className={cx(c === value && 'on')} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}
