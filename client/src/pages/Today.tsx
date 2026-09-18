import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, ShoppingBasket, Hammer, Plus, ArrowRight, Activity as ActivityIcon, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useHousehold, useSummary, useCurrentMember } from '@/lib/hooks';
import { greeting, friendlyDate, timeAgo, today, addDays } from '@/lib/format';
import { Card, Button, Empty, Progress, Badge } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { ShoppingRow } from '@/components/ShoppingRow';
import { TaskSheet } from '@/components/TaskSheet';
import { ShoppingItemSheet } from '@/components/ShoppingItemSheet';
import { ProjectIcon } from '@/components/ProjectIcon';
import { CalendarCard } from '@/components/CalendarCard';
import { PROJECT_STATUS } from '@/lib/format';
import type { Task, ShoppingItem } from '@shared/types';

export function Today() {
  const me = useCurrentMember();
  const { data: household } = useHousehold();
  const { data: summary } = useSummary();
  const tasksQ = useQuery({ queryKey: keys.tasks({ status: 'open', member: me?.id }), queryFn: () => api.tasks({ status: 'open', member: me?.id }) });
  const shopQ = useQuery({ queryKey: keys.shoppingItems({ list: 1, status: 'open', member: me?.id }), queryFn: () => api.shoppingItems({ list: 1, status: 'open', member: me?.id }) });
  const projQ = useQuery({ queryKey: keys.projects({ status: 'active' }), queryFn: () => api.projects({ status: 'active' }) });
  const actQ = useQuery({ queryKey: keys.activity({ limit: 8 }), queryFn: () => api.activity({ limit: 8 }) });
  const [editTask, setEditTask] = useState<Task | null | 'new'>(null);
  const [editItem, setEditItem] = useState<ShoppingItem | null | 'new'>(null);

  const t = today();
  const weekEnd = addDays(t, 7);
  const tasks = tasksQ.data ?? [];
  const attention = tasks.filter((x) => x.due_date && x.due_date <= t);
  const upcoming = tasks.filter((x) => x.due_date && x.due_date > t && x.due_date <= weekEnd);
  const projectName = (id: number | null) => projQ.data?.find((p) => p.id === id)?.name;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{dateLine}</p>
          <h1>{greeting(me?.name)}</h1>
          <p className="sub">{summaryLine(summary)}</p>
        </div>
        <div className="row">
          <Button icon={Plus} onClick={() => setEditItem('new')} className="hide-mobile">Shopping item</Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditTask('new')}>To-do</Button>
        </div>
      </header>

      {summary && (
        <div className="grid-3">
          <div className={`stat${summary.tasks_overdue ? ' warn' : ''}`}>
            <b>{summary.tasks_overdue ? summary.tasks_overdue : summary.tasks_due_today}</b>
            <span>{summary.tasks_overdue ? 'overdue' : 'due today'}</span>
          </div>
          <div className="stat">
            <b>{summary.shopping_open}</b>
            <span>to pick up</span>
          </div>
          <div className="stat">
            <b>{summary.projects_active}</b>
            <span>active {summary.projects_active === 1 ? 'project' : 'projects'}</span>
          </div>
        </div>
      )}

      <div className="grid-2">
        <Card title={me ? 'Needs your attention' : 'Needs attention'} icon={CheckSquare} flush action={<Link to="/todos" className="btn btn-ghost btn-sm">All to-dos <ArrowRight /></Link>}>
          {tasksQ.isLoading ? null : attention.length ? (
            <div className="list">{attention.slice(0, 6).map((x) => <TaskRow key={x.id} task={x} onOpen={setEditTask} projectName={projectName(x.project_id)} />)}</div>
          ) : (
            <Empty icon={CheckSquare} title="Nothing due today" hint={upcoming.length ? `${upcoming.length} coming up this week` : 'Enjoy the calm.'} />
          )}
          {upcoming.length > 0 && attention.length < 6 && (
            <div className="list-section">
              <header><CalendarDays size={13} /> Coming up</header>
              <div className="list">{upcoming.slice(0, 6 - attention.length).map((x) => <TaskRow key={x.id} task={x} onOpen={setEditTask} projectName={projectName(x.project_id)} />)}</div>
            </div>
          )}
        </Card>

        <Card title="Shopping list" icon={ShoppingBasket} flush action={<Link to="/shopping" className="btn btn-ghost btn-sm">Open list <ArrowRight /></Link>}>
          {shopQ.isLoading ? null : shopQ.data?.length ? (
            <div className="list">{shopQ.data.slice(0, 6).map((i) => <ShoppingRow key={i.id} item={i} onOpen={setEditItem} />)}</div>
          ) : (
            <Empty icon={ShoppingBasket} title="The list is empty" hint="Add something you're running low on." />
          )}
          {(shopQ.data?.length ?? 0) > 6 && (
            <Link to="/shopping" className="link-row">
              <span className="muted">and {shopQ.data!.length - 6} more…</span>
            </Link>
          )}
        </Card>
      </div>

      <CalendarCard />

      <Card title="Projects in motion" icon={Hammer} action={<Link to="/projects" className="btn btn-ghost btn-sm">All projects <ArrowRight /></Link>}>
        {projQ.data?.length ? (
          <div className="project-grid">
            {projQ.data.slice(0, 3).map((p) => {
              const pct = p.task_count ? Math.round((p.task_done_count / p.task_count) * 100) : 0;
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="card project-card" style={{ borderTopColor: p.color }}>
                  <div className="row">
                    <ProjectIcon icon={p.icon} color={p.color} />
                    <div className="grow">
                      <h3 className="truncate">{p.name}</h3>
                      <Badge tone={PROJECT_STATUS[p.status]!.tone}>{PROJECT_STATUS[p.status]!.label}</Badge>
                    </div>
                  </div>
                  <Progress value={pct} />
                  <div className="foot">
                    <span>{p.task_done_count}/{p.task_count} to-dos</span>
                    {p.next_milestone && <span className="truncate">· Next: {p.next_milestone.title}</span>}
                    {p.target_date && <span className="right">{friendlyDate(p.target_date)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Empty icon={Hammer} title="No active projects" hint="Start one from the Projects page." />
        )}
      </Card>

      {actQ.data && actQ.data.length > 0 && (
        <Card title="Recent activity" icon={ActivityIcon} flush>
          <div className="list">
            {actQ.data.map((a) => (
              <div key={a.id} className="activity-row">
                <span><b>{a.actor_name}</b> <span className="muted">{lower(a.summary)}</span></span>
                <span className="when">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <TaskSheet open={editTask !== null} onClose={() => setEditTask(null)} task={editTask === 'new' ? null : editTask} projects={projQ.data} />
      <ShoppingItemSheet open={editItem !== null} onClose={() => setEditItem(null)} item={editItem === 'new' ? null : editItem} listId={1} />
      {household && null}
    </div>
  );
}

function summaryLine(s?: { tasks_open: number; tasks_due_today: number; tasks_overdue: number; shopping_open: number; projects_active: number }) {
  if (!s) return 'Here is how home is doing.';
  if (s.tasks_overdue) return `${s.tasks_overdue} ${s.tasks_overdue === 1 ? 'thing is' : 'things are'} overdue. Let's catch up.`;
  if (s.tasks_due_today) return `${s.tasks_due_today} ${s.tasks_due_today === 1 ? 'thing' : 'things'} to do today.`;
  return 'Nothing pressing today. A quiet home is a good home.';
}

const lower = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
