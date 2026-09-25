import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, CheckSquare, ChevronDown, ChevronRight, Sparkles, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useCurrentMember, useInvalidatingMutation } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { TASK_BUCKETS, taskBucket, getWeekStart, type TaskBucket } from '@/lib/format';
import { parseTaskText } from '@shared/parse';
import { Card, Button, Empty, Segmented, cx } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { TaskSheet } from '@/components/TaskSheet';
import { useToast } from '@/components/Toast';
import type { Task } from '@shared/types';

export function Todos() {
  const me = useCurrentMember();
  const { view } = usePrefs();
  const toast = useToast();
  const mine = view === 'mine' && !!me;
  const tasksQ = useQuery({ queryKey: keys.tasks({ status: 'all', member: mine ? me!.id : undefined }), queryFn: () => api.tasks({ status: 'all', member: mine ? me!.id : undefined }) });
  const projQ = useQuery({ queryKey: keys.projects({ status: 'all' }), queryFn: () => api.projects({ status: 'all' }) });
  const [edit, setEdit] = useState<Task | null | 'new'>(null);
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState('');

  const create = useInvalidatingMutation((text: string) => {
    const parsed = parseTaskText(text, new Date(), getWeekStart());
    return api.createTask({ title: parsed.title, due_date: parsed.due_date, due_window: parsed.due_window, due_window_start: parsed.due_window_start, priority: parsed.priority ?? 'normal' });
  }, ['tasks', 'summary']);
  const clearDone = useInvalidatingMutation(() => api.clearCompletedTasks(), ['tasks', 'summary']);

  const groups = useMemo(() => {
    const all = tasksQ.data ?? [];
    const buckets = Object.fromEntries(TASK_BUCKETS.map((b) => [b.key, [] as Task[]])) as Record<TaskBucket, Task[]>;
    for (const x of all) if (x.status === 'open') buckets[taskBucket(x)].push(x);
    return { buckets, done: all.filter((x) => x.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')) };
  }, [tasksQ.data]);
  const projectName = (id: number | null) => projQ.data?.find((p) => p.id === id)?.name;
  const openCount = Object.values(groups.buckets).reduce((n, list) => n + list.length, 0);

  const submitQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    setQuick('');
    await create.mutateAsync(text);
    toast('Added');
  };

  const Section = ({ title, items, tone }: { title: string; items: Task[]; tone?: string }) =>
    items.length ? (
      <div className="list-section">
        <header className={tone}>
          {title} <span className="n">{items.length}</span>
        </header>
        <div className="list">{items.map((x) => <TaskRow key={x.id} task={x} onOpen={setEdit} projectName={projectName(x.project_id)} />)}</div>
      </div>
    ) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>To-dos</h1>
          <p className="sub">{openCount ? `${openCount} open` : 'All clear'}{mine ? ' · showing yours' : ''}</p>
        </div>
        <div className="row">
          {me && (
            <Segmented<'everyone' | 'mine'> value={mine ? 'mine' : 'everyone'} onChange={(v) => setPrefs({ view: v })} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'Only mine' }]} />
          )}
          <Link to="/calendar" className="btn btn-secondary" aria-label="Calendar" title="Calendar"><CalendarDays /><span className="hide-mobile">Calendar</span></Link>
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')} className="hide-mobile">New to-do</Button>
        </div>
      </header>

      <form className="quick-add" onSubmit={submitQuick}>
        <Sparkles />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a to-do… try “Paint fence next week !high”" aria-label="Quick add to-do" enterKeyHint="done" />
        <span className="hint">Enter to add</span>
        <Button variant="primary" size="sm" type="submit" disabled={!quick.trim()}>Add</Button>
      </form>

      <Card flush>
        {tasksQ.isLoading ? null : openCount ? (
          <>
            {TASK_BUCKETS.map((b) => <Section key={b.key} title={b.label} items={groups.buckets[b.key]} tone={b.tone} />)}
          </>
        ) : (
          <Empty icon={CheckSquare} title={mine ? 'Nothing on your plate' : 'Nothing to do'} hint="Add something above, or enjoy the moment." />
        )}
        {groups.done.length > 0 && (
          <div className="list-section">
            <header>
              <button type="button" className="row" style={{ gap: 6, color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }} onClick={() => setShowDone((v) => !v)}>
                {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />} History <span className="n">{groups.done.length}</span>
              </button>
              {showDone && (
                <Button size="sm" variant="ghost" className="right" onClick={() => clearDone.mutate(undefined as never)}>Clear completed</Button>
              )}
            </header>
            {showDone && <div className={cx('list')}>{groups.done.map((x) => <TaskRow key={x.id} task={x} onOpen={setEdit} projectName={projectName(x.project_id)} />)}</div>}
          </div>
        )}
      </Card>

      <button type="button" className="fab" aria-label="New to-do" onClick={() => setEdit('new')}><Plus /></button>
      <TaskSheet open={edit !== null} onClose={() => setEdit(null)} task={edit === 'new' ? null : edit} projects={projQ.data?.filter((p) => p.status !== 'done')} />
    </div>
  );
}
