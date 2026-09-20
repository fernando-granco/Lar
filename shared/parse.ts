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

/** Pull light-weight hints out of a to-do title: "!high", "!urgent", "today", "tomorrow", "next week", "fri". */
export function parseTaskText(text: string, today = new Date()): { title: string; due_date: string | null; priority: 'low' | 'normal' | 'high' | 'urgent' | null } {
  let title = text.trim();
  type Priority = 'low' | 'normal' | 'high' | 'urgent';
  let priority: Priority | null = null;
  let due: Date | null = null;
  const pm = title.match(/\s*!(low|normal|high|urgent)\b/i);
  if (pm) {
    priority = pm[1]!.toLowerCase() as Priority;
    title = title.replace(pm[0], ' ');
  }
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rules: [RegExp, () => Date][] = [
    [/\b(today)\b/i, () => base],
    [/\b(tomorrow|tmrw)\b/i, () => addDays(base, 1)],
    [/\b(next week)\b/i, () => addDays(base, 7)],
    [/\b(this weekend)\b/i, () => addDays(base, ((6 - base.getDay() + 7) % 7) || 7)],
  ];
  for (const [re, fn] of rules) {
    const m = title.match(re);
    if (m) {
      due = fn();
      title = title.replace(m[0], ' ');
      break;
    }
  }
  if (!due) {
    const m = title.match(/(?:^|\s)(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday)?\b\s*$/i);
    if (m) {
      const target = days.indexOf(m[1]!.toLowerCase().slice(0, 3));
      const delta = ((target - base.getDay() + 7) % 7) || 7;
      due = addDays(base, delta);
      title = title.replace(m[0], ' ');
    }
  }
  return { title: title.replace(/\s+/g, ' ').trim(), due_date: due ? isoDate(due) : null, priority };
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
