import { isoDate, windowStart, windowEnd, type WeekStart } from '@shared/parse';
import type { Task, DueWindow } from '@shared/types';

export const today = () => isoDate(new Date());

// The household's first day of the week, kept here so every date helper agrees. App sets it from settings.
let weekStartsOn: WeekStart = 'monday';
export const setWeekStart = (value: WeekStart) => {
  weekStartsOn = value;
};
export const getWeekStart = () => weekStartsOn;

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + n);
  return isoDate(dt);
}

export function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "Today", "Tomorrow", "Yesterday", "Mon, Sep 21", "Mar 3, 2027". */
export function friendlyDate(iso: string | null | undefined, opts: { relative?: boolean } = { relative: true }) {
  if (!iso) return '';
  const t = today();
  if (opts.relative) {
    if (iso === t) return 'Today';
    if (iso === addDays(t, 1)) return 'Tomorrow';
    if (iso === addDays(t, -1)) return 'Yesterday';
  }
  const d = parseIso(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const within6 = Math.abs(d.getTime() - parseIso(t).getTime()) < 6 * 86400000;
  if (within6 && opts.relative) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A day heading that always carries the date: "Today · Thu, Sep 25", "Tomorrow · Fri, Sep 26", "Monday, Sep 28". */
export function dayHeading(iso: string) {
  const t = today();
  const d = parseIso(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const };
  const short = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...year });
  if (iso === t) return `Today · ${short}`;
  if (iso === addDays(t, 1)) return `Tomorrow · ${short}`;
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...year });
}

/** "This week", "Next week", "Week of Oct 5", "This month", "Next month", "November". */
export function windowLabel(kind: DueWindow, start: string) {
  const t = today();
  if (kind === 'week') {
    const current = windowStart('week', t, weekStartsOn);
    if (start === current) return 'This week';
    if (start === addDays(current, 7)) return 'Next week';
    if (start === addDays(current, -7)) return 'Last week';
    return `Week of ${friendlyDate(start, { relative: false })}`;
  }
  const current = windowStart('month', t);
  if (start === current) return 'This month';
  if (start === addDays(windowEnd('month', current), 1)) return 'Next month';
  const d = parseIso(start);
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

type DueParts = Pick<Task, 'due_date' | 'due_window' | 'due_window_start'>;

/** The day a to-do is due by: its date, or the last day of its week or month. */
export function taskDueBy(task: DueParts): string | null {
  if (task.due_date) return task.due_date;
  if (task.due_window && task.due_window_start) return windowEnd(task.due_window, task.due_window_start);
  return null;
}

export function dueLabel(task: DueParts) {
  if (task.due_date) return friendlyDate(task.due_date);
  if (task.due_window && task.due_window_start) return windowLabel(task.due_window, task.due_window_start);
  return '';
}

/** Like dueTone, but a soft window counts as overdue only once it has fully passed. */
export function taskTone(task: DueParts, done = false): ReturnType<typeof dueTone> {
  if (task.due_date || done) return dueTone(task.due_date, done);
  const by = taskDueBy(task);
  if (!by) return 'none';
  if (by < today()) return 'overdue';
  return task.due_window_start! <= today() ? 'soon' : 'later';
}

export type TaskBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday';

/** Buckets in the order people care about them. */
export const TASK_BUCKETS: { key: TaskBucket; label: string; tone?: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'overdue' },
  { key: 'today', label: 'Today', tone: 'today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'someday', label: 'No date' },
];

export function taskBucket(task: DueParts): TaskBucket {
  const t = today();
  const by = taskDueBy(task);
  if (!by) return 'someday';
  if (by < t) return 'overdue';
  if (task.due_date === t) return 'today';
  if (task.due_date === addDays(t, 1)) return 'tomorrow';
  if (by <= addDays(t, 7) || (task.due_window && task.due_window_start! <= t && task.due_window === 'week')) return 'week';
  return 'later';
}

export function daysUntil(iso: string) {
  return Math.round((parseIso(iso).getTime() - parseIso(today()).getTime()) / 86400000);
}

export function dueTone(iso: string | null | undefined, done = false): 'overdue' | 'today' | 'soon' | 'later' | 'none' {
  if (!iso || done) return 'none';
  const n = daysUntil(iso);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 3) return 'soon';
  return 'later';
}

export function money(amount: number | null | undefined, currency = 'USD') {
  if (amount === null || amount === undefined) return '';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatQuantity(q: number | null, unit: string) {
  if (q === null || q === undefined) return unit;
  const n = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  return unit ? `${n} ${unit}` : n;
}

export function greeting(name?: string | null) {
  const h = new Date().getHours();
  const word = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${word}, ${name}.` : `${word}.`;
}

export const PROJECT_STATUS: Record<string, { label: string; tone: string }> = {
  idea: { label: 'Idea', tone: 'neutral' },
  planned: { label: 'Planned', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  on_hold: { label: 'On hold', tone: 'warn' },
  done: { label: 'Done', tone: 'muted' },
};

export const PRIORITY: Record<string, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'muted' },
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'High', tone: 'warn' },
  urgent: { label: 'Urgent', tone: 'danger' },
};
