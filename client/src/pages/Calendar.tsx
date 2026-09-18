import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Milestone as MilestoneIcon, Target, Clock, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { useHousehold, useCurrentMember } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { today, addDays, parseIso, friendlyDate } from '@/lib/format';
import { isoDate } from '@shared/parse';
import { Card, Button, Segmented, Empty, IconButton, cx } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { TaskSheet } from '@/components/TaskSheet';
import type { Task, Agenda, CalendarEvent } from '@shared/types';

/** Month view of everything with a date: to-dos, milestones, project targets, and connected calendars. */
export function CalendarPage() {
  const me = useCurrentMember();
  const { data: household } = useHousehold();
  const { view } = usePrefs();
  const mine = view === 'mine' && !!me;
  const t = today();
  const [month, setMonth] = useState(t.slice(0, 7)); // YYYY-MM
  const [selected, setSelected] = useState(t);
  const [edit, setEdit] = useState<Task | null | 'new'>(null);

  const weekStart = household?.settings.week_starts_on === 'sunday' ? 0 : 1;
  const grid = useMemo(() => buildGrid(month, weekStart), [month, weekStart]);
  const range = { from: grid[0]!, to: grid[grid.length - 1]!, member: mine ? me!.id : undefined };
  const agendaQ = useQuery({ queryKey: ['calendar', 'agenda', range], queryFn: () => api.agenda(range), placeholderData: (prev) => prev });
  const projQ = useQuery({ queryKey: ['projects', { status: 'all' }], queryFn: () => api.projects({ status: 'all' }) });

  const byDay = useMemo(() => indexByDay(agendaQ.data, grid[0]!, grid[grid.length - 1]!), [agendaQ.data, grid]);
  const monthDate = parseIso(`${month}-01`);
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (n: number) => {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth() + n, 1);
    setMonth(isoDate(d).slice(0, 7));
  };
  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7 + weekStart); // a Sunday + offset
    return Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString(undefined, { weekday: 'short' }));
  }, [weekStart]);
  const day = byDay.get(selected) ?? { tasks: [], milestones: [], projects: [], events: [] };
  const projectName = (id: number | null) => projQ.data?.find((p) => p.id === id)?.name;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="sub">To-dos, milestones, project targets{household ? '' : ''}, and your connected calendars.</p>
        </div>
        <div className="row">
          {me && <Segmented<'everyone' | 'mine'> value={mine ? 'mine' : 'everyone'} onChange={(v) => setPrefs({ view: v })} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'Mine' }]} />}
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')} className="hide-mobile">To-do</Button>
        </div>
      </header>

      <Card flush>
        <div className="row" style={{ padding: '14px 16px 10px' }}>
          <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
          <h2 className="display" style={{ fontSize: 22, minWidth: 180, textAlign: 'center' }}>{monthLabel}</h2>
          <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
          <Button size="sm" variant="ghost" className="right" onClick={() => { setMonth(t.slice(0, 7)); setSelected(t); }}>Today</Button>
        </div>
        <div className="cal-grid" role="grid">
          {weekdays.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
          {grid.map((d) => {
            const items = byDay.get(d);
            const chips = items ? [...items.tasks.map((x) => ({ key: `t${x.id}`, cls: cx(x.status === 'done' && 'done'), text: x.title, color: undefined as string | undefined })), ...items.milestones.map((m) => ({ key: `m${m.id}`, cls: cx('milestone', m.done && 'done'), text: `◆ ${m.title}`, color: undefined })), ...items.projects.map((p) => ({ key: `p${p.id}`, cls: 'milestone', text: `🎯 ${p.name}`, color: p.color })), ...items.events.map((e, i) => ({ key: `e${i}${e.start}`, cls: 'event', text: e.title, color: e.color }))] : [];
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                className={cx('cal-cell', d.slice(0, 7) !== month && 'other', d === t && 'today', d === selected && 'selected')}
                onClick={() => setSelected(d)}
                aria-label={friendlyDate(d, { relative: false })}
              >
                <span className="cal-day">{Number(d.slice(8))}</span>
                {chips.slice(0, 3).map((c) => (
                  <span key={c.key} className={cx('cal-chip', c.cls)} style={c.color ? { borderLeftColor: c.color } : undefined}>{c.text}</span>
                ))}
                {chips.length > 3 && <span className="cal-more">+{chips.length - 3} more</span>}
                {chips.length > 0 && (
                  <span className="cal-dots" aria-hidden>
                    {chips.slice(0, 4).map((c) => <i key={c.key} style={{ background: c.color ?? (c.cls.includes('milestone') ? 'var(--accent)' : c.cls === 'event' ? 'var(--text-3)' : undefined) }} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="cal-legend" style={{ padding: '10px 16px' }}>
          <span><i style={{ background: 'var(--primary)' }} />To-do</span>
          <span><i style={{ background: 'var(--accent)' }} />Milestone / target</span>
          <span><i style={{ background: 'var(--text-3)' }} />Calendar event</span>
        </div>
      </Card>

      <Card title={friendlyDate(selected)} icon={CalendarDays} flush action={<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>To-do on this day</Button>}>
        {day.tasks.length + day.milestones.length + day.projects.length + day.events.length === 0 ? (
          <Empty icon={CalendarDays} title="Nothing on this day" />
        ) : (
          <div className="list">
            {day.tasks.map((x) => <TaskRow key={x.id} task={x} onOpen={setEdit} projectName={projectName(x.project_id)} />)}
            {day.milestones.map((m) => (
              <Link key={`m${m.id}`} to={`/projects/${m.project_id}`} className="rowitem">
                <span className="dot" style={{ background: m.color, marginTop: 7 }} />
                <div className="body">
                  <div className={cx('title', m.done && 'strike')}>{m.title}</div>
                  <div className="meta"><span className="row" style={{ gap: 4 }}><MilestoneIcon /> Milestone · {m.project_name}</span></div>
                </div>
              </Link>
            ))}
            {day.projects.map((p) => (
              <Link key={`p${p.id}`} to={`/projects/${p.id}`} className="rowitem">
                <span className="dot" style={{ background: p.color, marginTop: 7 }} />
                <div className="body">
                  <div className="title">{p.name}</div>
                  <div className="meta"><span className="row" style={{ gap: 4 }}><Target /> Project target date</span></div>
                </div>
              </Link>
            ))}
            {day.events.map((e, i) => (
              <div key={`e${i}`} className="rowitem" style={{ cursor: 'default' }}>
                <span className="dot" style={{ background: e.color, marginTop: 7 }} />
                <div className="body">
                  <div className="title">{e.title}</div>
                  <div className="meta"><span className="row" style={{ gap: 4 }}><Clock /> {e.all_day ? 'All day' : timeRange(e)}</span><span className="faint">{e.calendar}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button type="button" className="fab" aria-label="New to-do" onClick={() => setEdit('new')}><Plus /></button>
      <TaskSheet open={edit !== null} onClose={() => setEdit(null)} task={edit === 'new' ? null : edit} initial={edit === 'new' ? { due_date: selected } : undefined} projects={projQ.data?.filter((p) => p.status !== 'done')} />
    </div>
  );
}

/** 6 weeks of YYYY-MM-DD strings covering the month, starting on the household's first weekday. */
function buildGrid(month: string, weekStart: number): string[] {
  const first = parseIso(`${month}-01`);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = isoDate(new Date(first.getFullYear(), first.getMonth(), 1 - offset));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

type DayItems = { tasks: Task[]; milestones: Agenda['milestones']; projects: Agenda['projects']; events: CalendarEvent[] };

function indexByDay(a: Agenda | undefined, from: string, to: string) {
  const map = new Map<string, DayItems>();
  const get = (d: string) => {
    let v = map.get(d);
    if (!v) map.set(d, (v = { tasks: [], milestones: [], projects: [], events: [] }));
    return v;
  };
  if (!a) return map;
  for (const x of a.tasks) if (x.due_date) get(x.due_date).tasks.push(x);
  for (const m of a.milestones) get(m.due_date).milestones.push(m);
  for (const p of a.projects) get(p.target_date).projects.push(p);
  for (const e of a.events) {
    if (e.all_day) {
      for (let d = e.start; d < e.end && d <= to; d = addDays(d, 1)) if (d >= from) get(d).events.push(e);
    } else {
      const d = isoDate(new Date(e.start));
      if (d >= from && d <= to) get(d).events.push(e);
    }
  }
  return map;
}

function timeRange(e: CalendarEvent) {
  const f = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${f(e.start)} – ${f(e.end)}`;
}
