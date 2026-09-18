import { isoDate } from '@shared/parse';

export const today = () => isoDate(new Date());

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
