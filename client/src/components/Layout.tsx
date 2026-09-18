import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Sun, CheckSquare, ShoppingBasket, Hammer, Settings, UserRound, ChevronsUpDown } from 'lucide-react';
import { useHousehold, useSummary, useCurrentMember } from '@/lib/hooks';
import { Avatar } from './ui';
import { MemberPicker } from './MemberPicker';

export function BrandMark() {
  return <img className="brand-mark" src="/lar.png" alt="" width={30} height={30} aria-hidden />;
}

const NAV = [
  { to: '/today', label: 'Today', icon: Sun, key: '' },
  { to: '/todos', label: 'To-dos', icon: CheckSquare, key: 'tasks_open' },
  { to: '/shopping', label: 'Shopping', icon: ShoppingBasket, key: 'shopping_open' },
  { to: '/projects', label: 'Projects', icon: Hammer, key: 'projects_active' },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { data: household } = useHousehold();
  const { data: summary } = useSummary();
  const me = useCurrentMember();
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = household?.settings.household_name || 'Lar';

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/today" className="brand">
          <BrandMark />
          <span>
            {name}
            <small>{name !== 'Lar' ? 'Lar' : "The family's home hub"}</small>
          </span>
        </Link>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <n.icon />
            {n.label}
            {n.key && summary && summary[n.key] > 0 && <span className="count">{summary[n.key]}</span>}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <NavLink to="/household" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Settings />
            Household
          </NavLink>
          <button type="button" className="member-switch" onClick={() => setPickerOpen(true)}>
            {me ? (
              <Avatar member={me} />
            ) : (
              <span className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                <UserRound size={14} />
              </span>
            )}
            <span className="grow">
              <b>{me ? me.name : 'Who are you?'}</b>
              <small>{me ? 'Using this device' : 'Tap to choose'}</small>
            </span>
            <ChevronsUpDown size={16} className="faint" />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/today" className="brand">
          <BrandMark />
          {name}
        </Link>
        <button type="button" className="right" style={{ display: 'flex' }} onClick={() => setPickerOpen(true)} aria-label="Choose who you are">
          {me ? (
            <Avatar member={me} />
          ) : (
            <span className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
              <UserRound size={14} />
            </span>
          )}
        </button>
      </header>

      <main className="main">{children}</main>

      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <n.icon />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <MemberPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
