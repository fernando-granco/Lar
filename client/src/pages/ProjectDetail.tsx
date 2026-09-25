import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, Trash2, Flag, CheckSquare, ShoppingBasket, Wallet, StickyNote, Link2, CalendarDays, Sparkles, Archive, ExternalLink, Milestone as MilestoneIcon, Receipt, MoreHorizontal, SlidersHorizontal, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useHousehold, useInvalidatingMutation, usePermissions, useCurrentMember } from '@/lib/hooks';
import { friendlyDate, money, PROJECT_STATUS, daysUntil, dueTone, today, getWeekStart } from '@/lib/format';
import { parseShoppingText, parseTaskText } from '@shared/parse';
import { Card, Button, Empty, Progress, Badge, CheckBox, Field, Input, TextArea, Avatar, IconButton, Select, Segmented, cx } from '@/components/ui';
import { Sheet, Confirm } from '@/components/Sheet';
import { ProjectSheet } from '@/components/ProjectSheet';
import { ProjectIcon } from '@/components/ProjectIcon';
import { TaskRow } from '@/components/TaskRow';
import { TaskSheet } from '@/components/TaskSheet';
import { ShoppingRow } from '@/components/ShoppingRow';
import { ShoppingItemSheet } from '@/components/ShoppingItemSheet';
import { useToast } from '@/components/Toast';
import { NoteCard, NoteEditor, NotesBoard } from '@/components/ProjectNotes';
import type { ProjectDetail as PD, Milestone, Expense, Task, ShoppingItem, ProjectNote } from '@shared/types';
import { setPrefs, usePrefs, type ProjectOverviewDensity, type ProjectOverviewSection, type ProjectOverviewWidth } from '@/lib/store';

type Tab = 'overview' | 'milestones' | 'todos' | 'shopping' | 'budget' | 'notes';

export function ProjectDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: household } = useHousehold();
  const projQ = useQuery({ queryKey: keys.project(id), queryFn: () => api.project(id), enabled: Number.isFinite(id) });
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (['overview', 'milestones', 'todos', 'shopping', 'budget', 'notes'].includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview'));
  const me = useCurrentMember();
  const { can } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState(false);
  const remove = useInvalidatingMutation(() => api.deleteProject(id), ['projects', 'shopping', 'tasks', 'summary']);
  const archive = useInvalidatingMutation((archived: boolean) => api.updateProject(id, { archived }), ['projects', 'project']);
  const setStatus = useInvalidatingMutation((status: PD['status']) => api.updateProject(id, { status }), ['projects', 'project', 'summary']);

  const p = projQ.data;
  const currency = household?.settings.currency ?? 'USD';
  if (projQ.isLoading) return null;
  if (!p)
    return (
      <div className="page">
        <Link to="/projects" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft /> Projects</Link>
        <div className="card"><Empty icon={Flag} title="Project not found" /></div>
      </div>
    );

  const st = PROJECT_STATUS[p.status]!;
  const pct = p.task_count ? Math.round((p.task_done_count / p.task_count) * 100) : p.milestone_count ? Math.round((p.milestone_done_count / p.milestone_count) * 100) : 0;
  const days = p.target_date ? daysUntil(p.target_date) : null;
  const owner = household?.members.find((m) => m.id === p.owner_id);
  const participantIds = [...new Set([...(p.owner_id ? [p.owner_id] : []), ...p.member_ids])];
  const openTasks = p.tasks.filter((t) => t.status === 'open');
  const openItems = p.shopping_items.filter((i) => !i.checked_at);
  // Kids change projects they started or own; the rest follows what adults allowed.
  const mayEdit = can('projects', me && (p.created_by === me.id || p.owner_id === me.id) ? me.id : p.created_by);

  const tabs: { key: Tab; label: string; icon: typeof Flag; n?: number }[] = [
    { key: 'overview', label: 'Overview', icon: Flag },
    { key: 'milestones', label: 'Milestones', icon: MilestoneIcon, n: p.milestones.length },
    { key: 'todos', label: 'To-dos', icon: CheckSquare, n: openTasks.length },
    { key: 'shopping', label: 'Shopping', icon: ShoppingBasket, n: openItems.length },
    { key: 'budget', label: 'Budget', icon: Wallet, n: p.expenses.length },
    { key: 'notes', label: 'Notes', icon: StickyNote, n: p.project_notes.length + p.links.length },
  ];

  return (
    <div className="page">
      <div className="row between">
        <Link to="/projects" className="btn btn-ghost btn-sm" style={{ marginLeft: -8 }}><ArrowLeft /> Projects</Link>
        <div className="row" style={{ gap: 4, position: 'relative' }}>
          {mayEdit && <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
          {mayEdit && <IconButton icon={MoreHorizontal} label="More" onClick={() => setMenu((v) => !v)} />}
          {menu && (
            <div className="card" style={{ position: 'absolute', right: 0, top: 40, zIndex: 5, minWidth: 200, padding: 6, boxShadow: 'var(--shadow)' }} onMouseLeave={() => setMenu(false)}>
              {p.status !== 'done' && <button type="button" className="nav-item" style={{ width: '100%' }} onClick={() => { setStatus.mutate('done'); setMenu(false); toast('Marked as done'); }}><CheckSquare /> Mark as done</button>}
              {p.status === 'done' && <button type="button" className="nav-item" style={{ width: '100%' }} onClick={() => { setStatus.mutate('active'); setMenu(false); }}><Flag /> Reopen</button>}
              <button type="button" className="nav-item" style={{ width: '100%' }} onClick={() => { archive.mutate(!p.archived); setMenu(false); toast(p.archived ? 'Unarchived' : 'Archived'); }}><Archive /> {p.archived ? 'Unarchive' : 'Archive'}</button>
              <button type="button" className="nav-item" style={{ width: '100%', color: 'var(--danger)' }} onClick={() => { setConfirmDelete(true); setMenu(false); }}><Trash2 /> Delete project</button>
            </div>
          )}
        </div>
      </div>

      <header className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <ProjectIcon icon={p.icon} color={p.color} size="lg" />
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <h1 className="display" style={{ fontSize: 30 }}>{p.name}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
            {p.priority === 'high' && <Badge tone="warn">High priority</Badge>}
            {p.archived && <Badge tone="muted">Archived</Badge>}
          </div>
          {p.description && <p className="muted" style={{ marginTop: 6, maxWidth: 640 }}>{p.description}</p>}
        </div>
      </header>

      <div className="grid-3">
        <div className="stat">
          <b>{pct}%</b>
          <span>{p.task_done_count}/{p.task_count} to-dos done</span>
          <div style={{ marginTop: 8 }}><Progress value={pct} /></div>
        </div>
        <div className={cx('stat', days !== null && days < 0 && p.status !== 'done' && 'warn')}>
          <b>{p.target_date ? (days === 0 ? 'Today' : days! > 0 ? `${days}d` : `${-days!}d`) : '—'}</b>
          <span>{p.target_date ? (days! >= 0 ? `left · ${friendlyDate(p.target_date, { relative: false })}` : `overdue · ${friendlyDate(p.target_date, { relative: false })}`) : 'no target date'}</span>
        </div>
        <div className={cx('stat', p.budget !== null && p.spent > p.budget && 'warn')}>
          <b>{money(p.spent, currency)}</b>
          <span>{p.budget !== null ? `of ${money(p.budget, currency)} budget` : 'spent · no budget set'}</span>
          {p.budget !== null && <div style={{ marginTop: 8 }}><Progress value={p.spent} max={p.budget} tone={p.spent > p.budget ? 'over' : p.spent > p.budget * 0.85 ? 'warn' : undefined} /></div>}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={cx(tab === t.key && 'on')} onClick={() => setTab(t.key)}>
            <t.icon size={15} className="hide-mobile" /> {t.label}
            {!!t.n && <span className="n">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview p={p} owner={owner} currency={currency} participantIds={participantIds} goTo={setTab} onEditProject={() => setEditing(true)} />}
      {tab === 'milestones' && <Milestones p={p} />}
      {tab === 'todos' && <ProjectTodos p={p} participantIds={participantIds} />}
      {tab === 'shopping' && <ProjectShopping p={p} currency={currency} participantIds={participantIds} />}
      {tab === 'budget' && <Budget p={p} currency={currency} onEditBudget={() => setEditing(true)} />}
      {tab === 'notes' && <Notes p={p} />}

      <ProjectSheet open={editing} onClose={() => setEditing(false)} project={p} />
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete "${p.name}"?`}
        body="Its milestones, to-dos, shopping list, and expenses go with it. This cannot be undone."
        onConfirm={async () => {
          await remove.mutateAsync(undefined as never);
          toast('Project deleted');
          navigate('/projects');
        }}
      />
    </div>
  );
}

// ---------------- Overview ----------------

const OVERVIEW_META: Record<ProjectOverviewSection, { label: string; icon: typeof Flag }> = {
  details: { label: 'Details', icon: Flag },
  milestones: { label: 'Milestones', icon: MilestoneIcon },
  todos: { label: 'To-dos', icon: CheckSquare },
  shopping: { label: 'Shopping list', icon: ShoppingBasket },
  budget: { label: 'Budget & expenses', icon: Wallet },
  notes: { label: 'Notes & links', icon: StickyNote },
};

function Overview({ p, owner, currency, participantIds, goTo, onEditProject }: { p: PD; owner?: { name: string; color: string; initials: string }; currency: string; participantIds: number[]; goTo: (t: Tab) => void; onEditProject: () => void }) {
  const { data: household } = useHousehold();
  const prefs = usePrefs();
  const toast = useToast();
  const members = household?.members.filter((m) => participantIds.includes(m.id) && m.id !== p.owner_id) ?? [];
  const limit = prefs.projectOverviewDensity === 'compact' ? 2 : 5;
  const nextMs = p.milestones.filter((m) => !m.done_at).slice(0, limit);
  const nextTasks = p.tasks.filter((t) => t.status === 'open').slice(0, limit);
  const nextItems = p.shopping_items.filter((item) => !item.checked_at).slice(0, limit);
  const recentExpenses = p.expenses.slice(0, limit);
  const [customize, setCustomize] = useState(false);
  const [editTask, setEditTask] = useState<Task | 'new' | null>(null);
  const [editItem, setEditItem] = useState<ShoppingItem | 'new' | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const addMilestone = useInvalidatingMutation(() => api.createMilestone(p.id, { title: milestoneTitle.trim(), due_date: milestoneDue || null, description: milestoneDescription }), ['project', 'projects']);
  const [note, setNote] = useState<ProjectNote | 'new' | null>(null);
  const overviewNotes = p.project_notes.filter((n) => n.show_on_overview).slice(0, limit);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const addLink = useInvalidatingMutation(() => api.createLink(p.id, { label: linkLabel.trim() || hostOf(linkUrl), url: linkUrl.trim() }), ['project']);

  const moveOverview = (key: ProjectOverviewSection, direction: -1 | 1) => {
    const next = [...prefs.projectOverviewOrder];
    const from = next.indexOf(key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!];
    setPrefs({ projectOverviewOrder: next });
  };
  const toggleOverview = (key: ProjectOverviewSection) => setPrefs({ projectOverviewHidden: prefs.projectOverviewHidden.includes(key) ? prefs.projectOverviewHidden.filter((item) => item !== key) : [...prefs.projectOverviewHidden, key] });
  const setOverviewWidth = (key: ProjectOverviewSection, width: ProjectOverviewWidth) => setPrefs({ projectOverviewWidths: { ...prefs.projectOverviewWidths, [key]: width } });

  const actionPair = (add: () => void, all: () => void, addLabel: string) => (
    <div className="row" style={{ gap: 3 }}>
      <Button size="sm" variant="ghost" icon={Plus} onClick={add}>{addLabel}</Button>
      <Button size="sm" variant="ghost" onClick={all}>All</Button>
    </div>
  );

  const renderSection = (key: ProjectOverviewSection) => {
    if (key === 'details') return (
      <Card title="Details" icon={Flag} action={<Button size="sm" variant="ghost" icon={Pencil} onClick={onEditProject}>Edit</Button>}>
        <dl className="kv">
          <dt>Owner</dt>
          <dd>{owner ? <span className="row" style={{ gap: 6 }}><Avatar member={owner} size="sm" /> {owner.name}</span> : <span className="faint">Nobody yet</span>}</dd>
          <dt>Involved</dt>
          <dd>{members.length ? <span className="row wrap" style={{ gap: 6 }}>{members.map((member) => <span key={member.id} className="row" style={{ gap: 4 }}><Avatar member={member} size="sm" /> {member.name}</span>)}</span> : <span className="faint">Just the owner</span>}</dd>
          <dt>Timeline</dt>
          <dd>{p.start_date || p.target_date ? `${p.start_date ? friendlyDate(p.start_date, { relative: false }) : '…'} → ${p.target_date ? friendlyDate(p.target_date, { relative: false }) : '…'}` : <span className="faint">No dates yet</span>}</dd>
          <dt>Budget</dt>
          <dd>{p.budget !== null ? `${money(p.spent, currency)} spent of ${money(p.budget, currency)}` : p.spent ? `${money(p.spent, currency)} spent` : <span className="faint">Not set</span>}</dd>
        </dl>
      </Card>
    );
    if (key === 'milestones') return (
      <Card title="Next milestones" icon={MilestoneIcon} flush action={actionPair(() => setMilestoneOpen(true), () => goTo('milestones'), 'Add')}>
        {nextMs.length ? <div className="list">{nextMs.map((milestone) => <div key={milestone.id} className="milestone-line" onClick={() => goTo('milestones')}><div className="rail"><span className="check round" /></div><div className="body"><div className="title">{milestone.title}</div>{milestone.due_date && <div className={cx('sub', dueTone(milestone.due_date) === 'overdue' && 'error')}>{friendlyDate(milestone.due_date)}</div>}</div></div>)}</div> : <Empty icon={MilestoneIcon} title={p.milestones.length ? 'All milestones reached' : 'No milestones yet'} />}
      </Card>
    );
    if (key === 'todos') return (
      <Card title="Up next" icon={CheckSquare} flush action={actionPair(() => setEditTask('new'), () => goTo('todos'), 'Add')}>
        {nextTasks.length ? <div className="list">{nextTasks.map((task) => <TaskRow key={task.id} task={task} onOpen={setEditTask} />)}</div> : <Empty icon={CheckSquare} title="No open to-dos" hint="Add the next concrete step." />}
      </Card>
    );
    if (key === 'shopping') return (
      <Card title="Shopping list" icon={ShoppingBasket} flush action={actionPair(() => setEditItem('new'), () => goTo('shopping'), 'Add')}>
        {nextItems.length ? <div className="list">{nextItems.map((item) => <ShoppingRow key={item.id} item={item} onOpen={setEditItem} />)}</div> : <Empty icon={ShoppingBasket} title="Nothing to buy" hint="Add materials, parts, or tools for this project." />}
      </Card>
    );
    if (key === 'budget') return (
      <Card title="Budget & expenses" icon={Wallet} flush action={actionPair(() => setExpenseOpen(true), () => goTo('budget'), 'Expense')}>
        <div className="overview-budget"><b>{money(p.spent, currency)}</b><span>{p.budget !== null ? `of ${money(p.budget, currency)} budget` : 'spent · no budget set'}</span>{p.budget !== null && <Progress value={p.spent} max={p.budget} tone={p.spent > p.budget ? 'over' : undefined} />}</div>
        {!!recentExpenses.length && <div className="list">{recentExpenses.map((expense) => <div key={expense.id} className="expense-row"><div className="title">{expense.title}</div><div className="amount">{money(expense.amount, currency)}</div><div className="sub">{friendlyDate(expense.date, { relative: false })}</div></div>)}</div>}
      </Card>
    );
    return (
      <Card title="Notes & links" icon={StickyNote} action={actionPair(() => setNote('new'), () => goTo('notes'), 'Note')}>
        {overviewNotes.length ? (
          <div className="notes-board compact">{overviewNotes.map((n) => <NoteCard key={n.id} note={n} onOpen={setNote} compact />)}</div>
        ) : (
          <p className="faint" style={{ fontSize: 13 }}>{p.project_notes.length ? 'No notes chosen for the overview. Open a note to show it here.' : 'No notes yet. Add one for measurements, ideas, or phone numbers.'}</p>
        )}
        {!!p.links.length && <div className="overview-links">{p.links.slice(0, limit).map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer"><ExternalLink /> <span className="truncate">{link.label}</span></a>)}</div>}
        <form className="overview-link-form" onSubmit={async (event) => { event.preventDefault(); if (!/^https?:\/\//i.test(linkUrl.trim())) return toast('Links need to start with http:// or https://'); await addLink.mutateAsync(undefined as never); setLinkLabel(''); setLinkUrl(''); toast('Link added'); }}>
          <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" inputMode="url" />
          {prefs.projectOverviewDensity === 'comfortable' && <Input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="Link label" />}
          <Button size="sm" variant="secondary" type="submit" icon={Plus} disabled={!linkUrl.trim()}>Link</Button>
        </form>
      </Card>
    );
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => setCustomize(true)}>Customize overview</Button></div>
      <div className={cx('project-overview-grid', prefs.projectOverviewDensity === 'compact' && 'compact')}>
        {prefs.projectOverviewOrder.filter((key) => !prefs.projectOverviewHidden.includes(key)).map((key) => <div key={key} className={cx('overview-slot', prefs.projectOverviewWidths[key])}>{renderSection(key)}</div>)}
      </div>

      <Sheet open={customize} onClose={() => setCustomize(false)} title="Customize project overview">
        <div className="form">
          <Field label="Card detail" hint="this device"><Segmented<ProjectOverviewDensity> value={prefs.projectOverviewDensity} onChange={(projectOverviewDensity) => setPrefs({ projectOverviewDensity })} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} /></Field>
          <div className="field"><span>Cards, order, and width <em>this device</em></span><div className="overview-order">{prefs.projectOverviewOrder.map((key, index) => { const hidden = prefs.projectOverviewHidden.includes(key); const Icon = OVERVIEW_META[key].icon; return <div key={key} className={hidden ? 'is-hidden' : ''}><Icon size={16} className="faint" /><b>{OVERVIEW_META[key].label}</b><Select aria-label={`${OVERVIEW_META[key].label} width`} value={prefs.projectOverviewWidths[key]} onChange={(event) => setOverviewWidth(key, event.target.value as ProjectOverviewWidth)}><option value="half">Half width</option><option value="full">Full width</option></Select><IconButton icon={hidden ? EyeOff : Eye} label={`${hidden ? 'Show' : 'Hide'} ${OVERVIEW_META[key].label}`} onClick={() => toggleOverview(key)} /><IconButton icon={ChevronUp} label={`Move ${OVERVIEW_META[key].label} up`} disabled={index === 0} onClick={() => moveOverview(key, -1)} /><IconButton icon={ChevronDown} label={`Move ${OVERVIEW_META[key].label} down`} disabled={index === prefs.projectOverviewOrder.length - 1} onClick={() => moveOverview(key, 1)} /></div>; })}</div></div>
        </div>
      </Sheet>
      <Sheet open={milestoneOpen} onClose={() => setMilestoneOpen(false)} title="New milestone" footer={<Button variant="primary" className="right" disabled={!milestoneTitle.trim() || addMilestone.isPending} onClick={async () => { await addMilestone.mutateAsync(undefined as never); setMilestoneTitle(''); setMilestoneDue(''); setMilestoneDescription(''); setMilestoneOpen(false); toast('Milestone added'); }}>Add milestone</Button>}>
        <div className="form"><Field label="Milestone"><Input autoFocus value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} /></Field><Field label="Target date" hint="optional"><Input type="date" value={milestoneDue} onChange={(event) => setMilestoneDue(event.target.value)} /></Field><Field label="Description" hint="optional"><TextArea value={milestoneDescription} onChange={(event) => setMilestoneDescription(event.target.value)} /></Field></div>
      </Sheet>
      <TaskSheet open={editTask !== null} onClose={() => setEditTask(null)} task={editTask === 'new' ? null : editTask} fixedProject={{ id: p.id, milestones: p.milestones, memberIds: participantIds }} />
      <ShoppingItemSheet open={editItem !== null} onClose={() => setEditItem(null)} item={editItem === 'new' ? null : editItem} listId={p.shopping_list.id} defaultMemberIds={participantIds} />
      <ExpenseSheet open={expenseOpen} onClose={() => setExpenseOpen(false)} projectId={p.id} currency={currency} />
      <NoteEditor project={p} note={note === 'new' ? null : note} open={note !== null} onClose={() => setNote(null)} />
    </>
  );
}

// ---------------- Milestones ----------------

function Milestones({ p }: { p: PD }) {
  const toast = useToast();
  const [sheet, setSheet] = useState<Milestone | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [confirm, setConfirm] = useState<Milestone | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const m = sheet === 'new' ? null : sheet;
    setTitle(m?.title ?? '');
    setDesc(m?.description ?? '');
    setDue(m?.due_date ?? '');
  }, [sheet]);
  const save = useInvalidatingMutation(() => (sheet === 'new' ? api.createMilestone(p.id, { title: title.trim(), description: desc, due_date: due || null }) : api.updateMilestone((sheet as Milestone).id, { title: title.trim(), description: desc, due_date: due || null })), ['project', 'projects']);
  const toggle = useInvalidatingMutation((m: Milestone) => api.updateMilestone(m.id, { done: !m.done_at }), ['project', 'projects']);
  const remove = useInvalidatingMutation((m: Milestone) => api.deleteMilestone(m.id), ['project', 'projects', 'tasks']);
  const tasksFor = (mid: number) => p.tasks.filter((t) => t.milestone_id === mid);
  return (
    <>
      <Card title="Milestones" icon={MilestoneIcon} flush action={<Button size="sm" icon={Plus} onClick={() => setSheet('new')}>Add milestone</Button>}>
        {p.milestones.length ? (
          <div className="list">
            {p.milestones.map((m) => {
              const ts = tasksFor(m.id);
              const doneN = ts.filter((t) => t.status === 'done').length;
              const done = !!m.done_at;
              return (
                <div key={m.id} className="milestone-line" onClick={() => setSheet(m)}>
                  <div className="rail"><CheckBox on={done} round onToggle={() => toggle.mutate(m)} label={done ? 'Reopen milestone' : 'Mark milestone reached'} /></div>
                  <div className="body">
                    <div className={cx('title', done && 'strike')}>{m.title}</div>
                    <div className="sub row wrap" style={{ gap: 10 }}>
                      {m.due_date && <span className={cx('row', dueTone(m.due_date, done) === 'overdue' && 'error')} style={{ gap: 4 }}><CalendarDays size={13} /> {done ? friendlyDate(m.due_date, { relative: false }) : friendlyDate(m.due_date)}</span>}
                      {ts.length > 0 && <span>{doneN}/{ts.length} to-dos</span>}
                      {m.description && <span className="truncate" style={{ maxWidth: 360 }}>{m.description}</span>}
                    </div>
                    {ts.length > 0 && !done && <div style={{ marginTop: 8, maxWidth: 260 }}><Progress value={doneN} max={ts.length} /></div>}
                  </div>
                  <IconButton icon={Trash2} label="Delete milestone" danger onClick={(e) => { e.stopPropagation(); setConfirm(m); }} />
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={MilestoneIcon} title="No milestones yet" hint='Big steps like "Design done", "Materials bought", "Built".' />
        )}
      </Card>
      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'new' ? 'New milestone' : 'Edit milestone'} footer={<Button variant="primary" className="right" disabled={!title.trim() || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast(sheet === 'new' ? 'Milestone added' : 'Saved'); setSheet(null); }}>{sheet === 'new' ? 'Add' : 'Save'}</Button>}>
        <div className="form">
          <Field label="Milestone"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Materials ordered" maxLength={160} /></Field>
          <Field label="Target date" hint="optional"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Description" hint="optional"><TextArea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 64 }} /></Field>
        </div>
      </Sheet>
      <Confirm open={confirm !== null} onClose={() => setConfirm(null)} title="Delete milestone?" body={`"${confirm?.title}". Its to-dos stay in the project.`} onConfirm={() => confirm && remove.mutate(confirm)} />
    </>
  );
}

// ---------------- To-dos ----------------

function ProjectTodos({ p, participantIds }: { p: PD; participantIds: number[] }) {
  const [edit, setEdit] = useState<Task | null | 'new'>(null);
  const [quick, setQuick] = useState('');
  const create = useInvalidatingMutation((text: string) => {
    const parsed = parseTaskText(text, new Date(), getWeekStart());
    return api.createTask({ title: parsed.title, due_date: parsed.due_date, due_window: parsed.due_window, due_window_start: parsed.due_window_start, priority: parsed.priority ?? 'normal', project_id: p.id, assignees: participantIds.length ? { member_ids: participantIds, group_ids: [] } : undefined });
  }, ['project', 'projects', 'tasks', 'summary']);
  const clearDone = useInvalidatingMutation(() => api.clearCompletedTasks(p.id), ['project', 'projects', 'tasks']);
  const open = p.tasks.filter((t) => t.status === 'open');
  const done = p.tasks.filter((t) => t.status === 'done');
  const byMilestone = useMemo(() => {
    const groups: { title: string; items: Task[] }[] = [];
    for (const m of p.milestones) {
      const items = open.filter((t) => t.milestone_id === m.id);
      if (items.length) groups.push({ title: m.title, items });
    }
    const loose = open.filter((t) => !t.milestone_id || !p.milestones.some((m) => m.id === t.milestone_id));
    if (loose.length) groups.push({ title: groups.length ? 'Not in a milestone' : '', items: loose });
    return groups;
  }, [p, open]);
  return (
    <>
      <form className="quick-add" onSubmit={async (e) => { e.preventDefault(); const t = quick.trim(); if (!t) return; setQuick(''); await create.mutateAsync(t); }}>
        <Sparkles />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a to-do to this project…" aria-label="Quick add to-do" enterKeyHint="done" />
        <Button variant="primary" size="sm" type="submit" disabled={!quick.trim()}>Add</Button>
      </form>
      <Card flush title="To-dos" icon={CheckSquare} action={<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>Detailed</Button>}>
        {open.length ? (
          byMilestone.map((g) => (
            <div key={g.title} className="list-section">
              {g.title && <header>{g.title} <span className="n">{g.items.length}</span></header>}
              <div className="list">{g.items.map((t) => <TaskRow key={t.id} task={t} onOpen={setEdit} />)}</div>
            </div>
          ))
        ) : (
          <Empty icon={CheckSquare} title="No open to-dos" hint="Add the next concrete step above." />
        )}
        {done.length > 0 && (
          <div className="list-section">
            <header>Done <span className="n">{done.length}</span><Button size="sm" variant="ghost" className="right" onClick={() => clearDone.mutate(undefined as never)}>Clear</Button></header>
            <div className="list">{done.map((t) => <TaskRow key={t.id} task={t} onOpen={setEdit} />)}</div>
          </div>
        )}
      </Card>
      <TaskSheet open={edit !== null} onClose={() => setEdit(null)} task={edit === 'new' ? null : edit} fixedProject={{ id: p.id, milestones: p.milestones, memberIds: participantIds }} />
    </>
  );
}

// ---------------- Shopping ----------------

function ProjectShopping({ p, currency, participantIds }: { p: PD; currency: string; participantIds: number[] }) {
  const toast = useToast();
  const [edit, setEdit] = useState<ShoppingItem | null | 'new'>(null);
  const [quick, setQuick] = useState('');
  const [expenseFrom, setExpenseFrom] = useState<ShoppingItem | null>(null);
  const create = useInvalidatingMutation((text: string) => {
    const parsed = parseShoppingText(text);
    return api.createShoppingItem({ list_id: p.shopping_list.id, ...parsed, priority: parsed.priority ?? 'normal', assignees: participantIds.length ? { member_ids: participantIds, group_ids: [] } : undefined });
  }, ['project', 'projects', 'shopping']);
  const clear = useInvalidatingMutation(() => api.clearChecked(p.shopping_list.id), ['project', 'projects', 'shopping']);
  const open = p.shopping_items.filter((i) => !i.checked_at);
  const checked = p.shopping_items.filter((i) => !!i.checked_at);
  const expensedItemIds = new Set(p.expenses.map((e) => e.shopping_item_id).filter(Boolean));
  const estimate = open.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
  return (
    <>
      <form className="quick-add" onSubmit={async (e) => { e.preventDefault(); const t = quick.trim(); if (!t) return; setQuick(''); await create.mutateAsync(t); }}>
        <Sparkles />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add something to buy for this project…" aria-label="Quick add item" enterKeyHint="done" />
        <Button variant="primary" size="sm" type="submit" disabled={!quick.trim()}>Add</Button>
      </form>
      <Card flush title="To buy" icon={ShoppingBasket} action={<div className="row">{estimate > 0 && <span className="faint" style={{ fontSize: 13 }}>≈ {money(estimate, currency)}</span>}<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>Detailed</Button></div>}>
        {open.length ? <div className="list">{open.map((i) => <ShoppingRow key={i.id} item={i} onOpen={setEdit} />)}</div> : <Empty icon={ShoppingBasket} title="Nothing to buy" hint="Materials, tools, parts: add them here so they show on the shopping page too." />}
        {checked.length > 0 && (
          <div className="list-section">
            <header>Bought <span className="n">{checked.length}</span><Button size="sm" variant="ghost" className="right" onClick={() => clear.mutate(undefined as never)}>Clear</Button></header>
            <div className="list">
              {checked.map((i) => (
                <div key={i.id} className="row" style={{ gap: 0 }}>
                  <div className="grow"><ShoppingRow item={i} onOpen={setEdit} /></div>
                  {!expensedItemIds.has(i.id) && (
                    <Button size="sm" variant="ghost" icon={Receipt} onClick={() => setExpenseFrom(i)} style={{ marginRight: 12 }} title="Log as expense">Expense</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      <ShoppingItemSheet open={edit !== null} onClose={() => setEdit(null)} item={edit === 'new' ? null : edit} listId={p.shopping_list.id} defaultMemberIds={participantIds} />
      <ExpenseSheet
        open={expenseFrom !== null}
        onClose={() => setExpenseFrom(null)}
        projectId={p.id}
        currency={currency}
        initial={expenseFrom ? { title: expenseFrom.name, amount: expenseFrom.price !== null ? expenseFrom.price * (expenseFrom.quantity ?? 1) : null, shopping_item_id: expenseFrom.id, category: 'Materials' } : undefined}
        onSaved={() => toast('Expense logged')}
      />
    </>
  );
}

// ---------------- Budget ----------------

const EXPENSE_CATEGORIES = ['Materials', 'Tools', 'Labor', 'Permits & fees', 'Delivery', 'Furniture', 'Plants', 'Other'];

function Budget({ p, currency, onEditBudget }: { p: PD; currency: string; onEditBudget: () => void }) {
  const [sheet, setSheet] = useState<Expense | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Expense | null>(null);
  const remove = useInvalidatingMutation((e: Expense) => api.deleteExpense(e.id), ['project', 'projects']);
  const remaining = p.budget !== null ? p.budget - p.spent : null;
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of p.expenses) m.set(e.category || 'Uncategorized', (m.get(e.category || 'Uncategorized') ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [p.expenses]);
  return (
    <>
      <div className="grid-2">
        <Card title="Budget" icon={Wallet} action={<Button size="sm" variant="ghost" icon={Pencil} onClick={onEditBudget}>{p.budget !== null ? 'Change' : 'Set budget'}</Button>}>
          <div className="budget-box">
            <div className="nums">
              <div><b>{money(p.spent, currency)}</b> <span>spent</span></div>
              {p.budget !== null && <div style={{ textAlign: 'right' }}><b style={{ color: remaining! < 0 ? 'var(--danger)' : undefined }}>{money(Math.abs(remaining!), currency)}</b> <span>{remaining! < 0 ? 'over' : 'left'}</span></div>}
            </div>
            {p.budget !== null ? <Progress value={p.spent} max={p.budget} tone={p.spent > p.budget ? 'over' : p.spent > p.budget * 0.85 ? 'warn' : undefined} /> : <p className="faint" style={{ fontSize: 13 }}>Set a budget to see how you're tracking.</p>}
            {p.budget !== null && <p className="faint" style={{ fontSize: 13 }}>{Math.round((p.spent / p.budget) * 100)}% of {money(p.budget, currency)}</p>}
          </div>
        </Card>
        <Card title="By category" icon={Receipt}>
          {byCat.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {byCat.map(([cat, amt]) => (
                <div key={cat}>
                  <div className="row between" style={{ fontSize: 13.5 }}><span>{cat}</span><span className="mono">{money(amt, currency)}</span></div>
                  <Progress value={amt} max={p.spent || 1} />
                </div>
              ))}
            </div>
          ) : (
            <p className="faint" style={{ fontSize: 13 }}>Expenses will be grouped here.</p>
          )}
        </Card>
      </div>
      <Card flush title="Expenses" icon={Receipt} action={<Button size="sm" icon={Plus} onClick={() => setSheet('new')}>Add expense</Button>}>
        {p.expenses.length ? (
          <div className="list">
            {p.expenses.map((e) => (
              <div key={e.id} className="expense-row" onClick={() => setSheet(e)}>
                <div className="title" style={{ fontWeight: 500 }}>{e.title}</div>
                <div className="amount">{money(e.amount, currency)}</div>
                <div className="sub">{friendlyDate(e.date, { relative: false })}{e.category ? ` · ${e.category}` : ''}{e.notes ? ` · ${e.notes}` : ''}</div>
                <IconButton icon={Trash2} label="Delete expense" danger onClick={(ev) => { ev.stopPropagation(); setConfirm(e); }} style={{ gridColumn: 2, justifySelf: 'end', marginTop: -6 }} />
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Receipt} title="No expenses yet" hint="Log what you spend to keep the budget honest." />
        )}
      </Card>
      <ExpenseSheet open={sheet !== null} onClose={() => setSheet(null)} projectId={p.id} currency={currency} expense={sheet === 'new' ? null : sheet} />
      <Confirm open={confirm !== null} onClose={() => setConfirm(null)} title="Delete expense?" body={confirm ? `${confirm.title} · ${money(confirm.amount, currency)}` : ''} onConfirm={() => confirm && remove.mutate(confirm)} />
    </>
  );
}

function ExpenseSheet({ open, onClose, projectId, currency, expense, initial, onSaved }: { open: boolean; onClose: () => void; projectId: number; currency: string; expense?: Expense | null; initial?: { title: string; amount: number | null; shopping_item_id: number | null; category: string }; onSaved?: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setTitle(expense?.title ?? initial?.title ?? '');
    setAmount(expense ? String(expense.amount) : initial?.amount != null ? String(initial.amount) : '');
    setDate(expense?.date ?? today());
    setCategory(expense?.category ?? initial?.category ?? '');
    setNotes(expense?.notes ?? '');
  }, [open, expense, initial]);
  const save = useInvalidatingMutation(() => {
    const body = { title: title.trim(), amount: Number(amount) || 0, date, category, notes, shopping_item_id: expense?.shopping_item_id ?? initial?.shopping_item_id ?? null };
    return expense ? api.updateExpense(expense.id, body) : api.createExpense(projectId, body);
  }, ['project', 'projects']);
  return (
    <Sheet open={open} onClose={onClose} title={expense ? 'Edit expense' : 'Log an expense'} footer={<Button variant="primary" className="right" disabled={!title.trim() || !amount || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); (onSaved ?? (() => toast(expense ? 'Saved' : 'Expense logged')))(); onClose(); }}>{expense ? 'Save' : 'Log expense'}</Button>}>
      <div className="form">
        <Field label="What"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pavers from the garden centre" maxLength={160} /></Field>
        <div className="form-grid">
          <Field label={`Amount (${currency})`}><Input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Category" hint="optional">
          <Input list="expense-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} placeholder="Materials, Tools…" />
          <datalist id="expense-categories">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Notes" hint="optional"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} /></Field>
      </div>
    </Sheet>
  );
}

// ---------------- Notes & links ----------------

function Notes({ p }: { p: PD }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const addLink = useInvalidatingMutation(() => api.createLink(p.id, { label: label.trim() || hostOf(url), url: url.trim() }), ['project']);
  const removeLink = useInvalidatingMutation((id: number) => api.deleteLink(id), ['project']);
  return (
    <>
      <NotesBoard project={p} />
      <Card title="Links" icon={Link2} flush>
        <div className="list">
          {p.links.map((l) => (
            <div key={l.id} className="link-row">
              <ExternalLink />
              <a href={l.url} target="_blank" rel="noreferrer" className="grow truncate" style={{ color: 'var(--primary)', fontWeight: 500 }}>{l.label}</a>
              <span className="faint mono truncate hide-mobile" style={{ maxWidth: 160 }}>{hostOf(l.url)}</span>
              <IconButton icon={Trash2} label="Remove link" danger onClick={() => removeLink.mutate(l.id)} />
            </div>
          ))}
        </div>
        <form
          className="form"
          style={{ padding: '14px 20px 8px', gap: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^https?:\/\//i.test(url.trim())) return toast('Links need to start with http:// or https://');
            await addLink.mutateAsync(undefined as never);
            setLabel('');
            setUrl('');
          }}
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          <div className="row">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={120} />
            <Button variant="secondary" type="submit" icon={Plus} disabled={!url.trim()}>Add</Button>
          </div>
        </form>
      </Card>
    </>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
