import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Hammer, CalendarDays, Wallet, ShoppingBasket } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useHousehold, useCurrentMember } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { friendlyDate, money, PROJECT_STATUS, daysUntil } from '@/lib/format';
import { Button, Empty, Chip, Progress, Badge, Segmented, AvatarStack } from '@/components/ui';
import { ProjectSheet } from '@/components/ProjectSheet';
import { ProjectIcon } from '@/components/ProjectIcon';
import type { Project, Member } from '@shared/types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'open', label: 'All open' },
  { key: 'active', label: 'Active' },
  { key: 'planned', label: 'Planned' },
  { key: 'idea', label: 'Ideas' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'done', label: 'Done' },
];

export function Projects() {
  const me = useCurrentMember();
  const { data: household } = useHousehold();
  const { projectsView } = usePrefs();
  const mine = projectsView === 'mine' && !!me;
  const navigate = useNavigate();
  const [filter, setFilter] = useState('open');
  const q = { status: filter, member: mine ? me!.id : undefined };
  const projQ = useQuery({ queryKey: keys.projects(q), queryFn: () => api.projects(q) });
  const [creating, setCreating] = useState(false);
  const currency = household?.settings.currency ?? 'USD';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="sub">Everything you're building, fixing, and dreaming up at home.</p>
        </div>
        <div className="row">
          {me && <Segmented<'everyone' | 'mine'> value={mine ? 'mine' : 'everyone'} onChange={(v) => setPrefs({ projectsView: v })} options={[{ value: 'mine', label: 'Mine' }, { value: 'everyone', label: 'Everyone' }]} />}
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)} className="hide-mobile">New project</Button>
        </div>
      </header>

      <div className="chip-row scroll">
        {FILTERS.map((f) => (
          <Chip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</Chip>
        ))}
      </div>

      {projQ.isLoading ? null : projQ.data?.length ? (
        <div className="project-grid">
          {projQ.data.map((p) => (
            <ProjectCard key={p.id} project={p} currency={currency} members={household?.members ?? []} />
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty icon={Hammer} title={filter === 'open' ? (mine ? 'No projects of yours yet' : 'No projects yet') : 'Nothing here'} hint={filter === 'open' ? (mine ? 'Start one, or switch to Everyone to see the whole household.' : 'Start with something small, like fixing that squeaky door.') : undefined} />
        </div>
      )}

      <button type="button" className="fab" aria-label="New project" onClick={() => setCreating(true)}><Plus /></button>
      <ProjectSheet open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/projects/${id}`)} />
    </div>
  );
}

export function ProjectCard({ project: p, currency, members }: { project: Project; currency: string; members: Member[] }) {
  const pct = p.task_count ? Math.round((p.task_done_count / p.task_count) * 100) : p.milestone_count ? Math.round((p.milestone_done_count / p.milestone_count) * 100) : 0;
  const st = PROJECT_STATUS[p.status]!;
  const over = p.budget !== null && p.spent > p.budget;
  const days = p.target_date ? daysUntil(p.target_date) : null;
  return (
    <Link to={`/projects/${p.id}`} className="card project-card" style={{ borderTopColor: p.color }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <ProjectIcon icon={p.icon} color={p.color} />
        <div className="grow">
          <h3>{p.name}</h3>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <Badge tone={st.tone}>{st.label}</Badge>
            {p.priority === 'high' && <Badge tone="warn">High priority</Badge>}
          </div>
        </div>
        <AvatarStack assignees={{ member_ids: p.member_ids, group_ids: [] }} members={members} groups={[]} showEveryone={false} />
      </div>
      {p.description && <p className="desc">{p.description}</p>}
      {(p.task_count > 0 || p.milestone_count > 0) && (
        <div>
          <div className="row between" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
            <span>{p.task_done_count}/{p.task_count} to-dos{p.milestone_count ? ` · ${p.milestone_done_count}/${p.milestone_count} milestones` : ''}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}
      <div className="foot">
        {p.target_date && (
          <span className="row" style={{ gap: 4, color: days !== null && days < 0 && p.status !== 'done' ? 'var(--danger)' : undefined }}>
            <CalendarDays size={13} /> {friendlyDate(p.target_date)}
          </span>
        )}
        {p.budget !== null && (
          <span className="row" style={{ gap: 4, color: over ? 'var(--danger)' : undefined }}>
            <Wallet size={13} /> {money(p.spent, currency)} / {money(p.budget, currency)}
          </span>
        )}
        {p.shopping_open_count > 0 && (
          <span className="row" style={{ gap: 4 }}>
            <ShoppingBasket size={13} /> {p.shopping_open_count}
          </span>
        )}
      </div>
    </Link>
  );
}
