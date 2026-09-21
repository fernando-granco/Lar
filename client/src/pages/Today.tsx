import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, ShoppingBasket, Hammer, Plus, ArrowRight, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useHousehold, useSummary, useCurrentMember } from '@/lib/hooks';
import { greeting, friendlyDate, today, addDays } from '@/lib/format';
import { Card, Button, Empty, Progress, Badge } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { ShoppingRow } from '@/components/ShoppingRow';
import { TaskSheet } from '@/components/TaskSheet';
import { ShoppingItemSheet } from '@/components/ShoppingItemSheet';
import { ProjectIcon } from '@/components/ProjectIcon';
import { CalendarCard } from '@/components/CalendarCard';
import { PROJECT_STATUS } from '@/lib/format';
import { usePrefs } from '@/lib/store';
import { MenuCard } from '@/components/MenuCard';
import { MobileQuickShopping } from '@/components/MobileQuickShopping';
import type { Task, ShoppingItem } from '@shared/types';

export function Today() {
  const me = useCurrentMember();
  const prefs = usePrefs();
  const { data: household } = useHousehold();
  const { data: summary } = useSummary();
  const tasksQ = useQuery({ queryKey: keys.tasks({ status: 'open', member: me?.id }), queryFn: () => api.tasks({ status: 'open', member: me?.id }) });
  const shopQ = useQuery({ queryKey: keys.shoppingItems({ list: 1, status: 'open', member: me?.id }), queryFn: () => api.shoppingItems({ list: 1, status: 'open', member: me?.id }) });
  const projQ = useQuery({ queryKey: keys.projects({ status: 'active', member: me?.id }), queryFn: () => api.projects({ status: 'active', member: me?.id }) });
  const allProjQ = useQuery({ queryKey: keys.projects({ status: 'all' }), queryFn: () => api.projects({ status: 'all' }) });
  const [editTask, setEditTask] = useState<Task | null | 'new'>(null);
  const [editItem, setEditItem] = useState<ShoppingItem | null | 'new'>(null);

  const t = today();
  const weekEnd = addDays(t, 7);
  const tasks = tasksQ.data ?? [];
  const attention = tasks.filter((x) => x.due_date && x.due_date <= t);
  const upcoming = tasks.filter((x) => x.due_date && x.due_date > t && x.due_date <= weekEnd);
  const projectName = (id: number | null) => allProjQ.data?.find((p) => p.id === id)?.name;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sectionOrder = (key: typeof prefs.dashboardOrder[number]) => prefs.dashboardOrder.indexOf(key);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{dateLine}</p>
          <h1>{greeting(me?.name)}</h1>
          <p className="sub">{summaryLine(summary)}</p>
        </div>
        <div className="row">
          <Link to="/calendar" className="btn btn-secondary" aria-label="Calendar" title="Calendar"><CalendarDays /><span className="hide-mobile">Calendar</span></Link>
          <Button icon={Plus} onClick={() => setEditItem('new')} className="hide-mobile">Shopping item</Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditTask('new')}>To-do</Button>
          <MobileQuickShopping />
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

      <div className="dashboard-sections">
        {!prefs.dashboardHidden.includes('todos') && <div style={{ order: sectionOrder('todos') }}>
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
        </div>}

        {!prefs.dashboardHidden.includes('shopping') && <div style={{ order: sectionOrder('shopping') }}>
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
        </div>}

        {!prefs.dashboardHidden.includes('calendar') && <div style={{ order: sectionOrder('calendar') }}><CalendarCard /></div>}

        {household?.settings.recipes_enabled && !prefs.dashboardHidden.includes('menu') && <div style={{ order: sectionOrder('menu') }}><MenuCard /></div>}

        {!!projQ.data?.length && !prefs.dashboardHidden.includes('projects') && (
        <div style={{ order: sectionOrder('projects') }}>
        <Card title={me ? 'Your projects in motion' : 'Projects in motion'} icon={Hammer} action={<Link to="/projects" className="btn btn-ghost btn-sm">All projects <ArrowRight /></Link>}>
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
        ) : null}
        </Card>
        </div>
        )}
      </div>

      <TaskSheet open={editTask !== null} onClose={() => setEditTask(null)} task={editTask === 'new' ? null : editTask} projects={allProjQ.data?.filter((p) => p.status !== 'done')} />
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
