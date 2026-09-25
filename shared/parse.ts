/** Turn quick-add text like "2x oat milk", "3 apples", "milk x2", "1.5 kg flour" into structured fields. */
export function parseShoppingText(text: string): { name: string; quantity: number | null; unit: string; priority: 'low' | 'normal' | 'high' | 'urgent' | null } {
  let s = text.trim().replace(/\s+/g, ' ');
  type Priority = 'low' | 'normal' | 'high' | 'urgent';
  let priority: Priority | null = null;
  const pm = s.match(/\s*!(low|normal|high|urgent)\b/i);
  if (pm) {
    priority = pm[1]!.toLowerCase() as Priority;
    s = s.replace(pm[0], ' ').trim();
  }
  let quantity: number | null = null;
  let unit = '';
  const units = ['kg', 'g', 'lb', 'lbs', 'oz', 'l', 'ml', 'pack', 'packs', 'box', 'boxes', 'bag', 'bags', 'bottle', 'bottles', 'can', 'cans', 'dozen', 'bunch'];
  const unitRe = units.join('|');
  let m = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${unitRe})?\\s*x?\\s+(.+)$`, 'i'));
  if (m) {
    quantity = Number(m[1]!.replace(',', '.'));
    unit = (m[2] ?? '').toLowerCase();
    s = m[3]!;
  } else if ((m = s.match(/^(.+?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i))) {
    s = m[1]!;
    quantity = Number(m[2]!.replace(',', '.'));
  } else if ((m = s.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unitRe})$`, 'i')))) {
    s = m[1]!;
    quantity = Number(m[2]!.replace(',', '.'));
    unit = m[3]!.toLowerCase();
  }
  return { name: capitalize(s.trim()), quantity: quantity && quantity > 0 ? quantity : null, unit, priority };
}

export type WeekStart = 'monday' | 'sunday';
type SoftDue = { due_window: 'week' | 'month'; due_window_start: string };

/** First day of the week or month that `date` falls in. */
export function windowStart(kind: 'week' | 'month', date: Date | string, weekStartsOn: WeekStart = 'monday'): string {
  const d = typeof date === 'string' ? fromIso(date) : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (kind === 'month') return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  const first = weekStartsOn === 'sunday' ? 0 : 1;
  return isoDate(addDays(d, -((d.getDay() - first + 7) % 7)));
}

/** Last day (inclusive) of a soft-due window. */
export function windowEnd(kind: 'week' | 'month', start: string): string {
  const d = fromIso(start);
  return isoDate(kind === 'week' ? addDays(d, 6) : new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** "this week", "next week", "this month", "next month" as a soft due window. */
export function softDue(which: 'this_week' | 'next_week' | 'this_month' | 'next_month', today = new Date(), weekStartsOn: WeekStart = 'monday'): SoftDue {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (which === 'this_week') return { due_window: 'week', due_window_start: windowStart('week', base, weekStartsOn) };
  if (which === 'next_week') return { due_window: 'week', due_window_start: windowStart('week', addDays(base, 7), weekStartsOn) };
  if (which === 'this_month') return { due_window: 'month', due_window_start: windowStart('month', base) };
  return { due_window: 'month', due_window_start: windowStart('month', new Date(base.getFullYear(), base.getMonth() + 1, 1)) };
}

/** Pull light-weight hints out of a to-do title: "!high", "!urgent", "today", "tomorrow", "this week", "next month", "fri". */
export function parseTaskText(
  text: string,
  today = new Date(),
  weekStartsOn: WeekStart = 'monday',
): { title: string; due_date: string | null; due_window: 'week' | 'month' | null; due_window_start: string | null; priority: 'low' | 'normal' | 'high' | 'urgent' | null } {
  let title = text.trim();
  type Priority = 'low' | 'normal' | 'high' | 'urgent';
  let priority: Priority | null = null;
  let due: Date | null = null;
  let soft: SoftDue | null = null;
  const pm = title.match(/\s*!(low|normal|high|urgent)\b/i);
  if (pm) {
    priority = pm[1]!.toLowerCase() as Priority;
    title = title.replace(pm[0], ' ');
  }
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const softRules: [RegExp, 'this_week' | 'next_week' | 'this_month' | 'next_month'][] = [
    [/\b(this week)\b/i, 'this_week'],
    [/\b(next week)\b/i, 'next_week'],
    [/\b(this month)\b/i, 'this_month'],
    [/\b(next month)\b/i, 'next_month'],
  ];
  for (const [re, which] of softRules) {
    const m = title.match(re);
    if (m) {
      soft = softDue(which, base, weekStartsOn);
      title = title.replace(m[0], ' ');
      break;
    }
  }
  const rules: [RegExp, () => Date][] = [
    [/\b(today)\b/i, () => base],
    [/\b(tomorrow|tmrw)\b/i, () => addDays(base, 1)],
    [/\b(this weekend)\b/i, () => addDays(base, ((6 - base.getDay() + 7) % 7) || 7)],
  ];
  for (const [re, fn] of soft ? [] : rules) {
    const m = title.match(re);
    if (m) {
      due = fn();
      title = title.replace(m[0], ' ');
      break;
    }
  }
  if (!due && !soft) {
    const m = title.match(/(?:^|\s)(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday)?\b\s*$/i);
    if (m) {
      const target = days.indexOf(m[1]!.toLowerCase().slice(0, 3));
      const delta = ((target - base.getDay() + 7) % 7) || 7;
      due = addDays(base, delta);
      title = title.replace(m[0], ' ');
    }
  }
  return {
    title: title.replace(/\s+/g, ' ').trim(),
    due_date: due ? isoDate(due) : null,
    due_window: soft?.due_window ?? null,
    due_window_start: soft?.due_window_start ?? null,
    priority,
  };
}

function fromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function capitalize(s: string) {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
