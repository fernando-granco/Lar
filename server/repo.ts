import { db, nowIso } from './db.js';
import type { Assignees, Member, Group, Task, ShoppingItem, Recurrence } from '../shared/types.js';

type AssignEntity = 'task' | 'shopping_item';

/** Load assignees for many entities in one query. Missing entries mean "everyone". */
export function getAssignees(type: AssignEntity, ids: number[]): Map<number, Assignees> {
  const map = new Map<number, Assignees>();
  if (!ids.length) return map;
  const rows = db
    .prepare(`SELECT entity_id, member_id, group_id FROM assignments WHERE entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})`)
    .all(type, ...ids) as { entity_id: number; member_id: number | null; group_id: number | null }[];
  for (const r of rows) {
    let a = map.get(r.entity_id);
    if (!a) map.set(r.entity_id, (a = { member_ids: [], group_ids: [] }));
    if (r.member_id) a.member_ids.push(r.member_id);
    if (r.group_id) a.group_ids.push(r.group_id);
  }
  return map;
}

export function setAssignees(type: AssignEntity, id: number, assignees: Assignees) {
  db.prepare('DELETE FROM assignments WHERE entity_type = ? AND entity_id = ?').run(type, id);
  const ins = db.prepare('INSERT INTO assignments (entity_type, entity_id, member_id, group_id) VALUES (?, ?, ?, ?)');
  for (const m of new Set(assignees.member_ids)) ins.run(type, id, m, null);
  for (const g of new Set(assignees.group_ids)) ins.run(type, id, null, g);
}

/** SQL fragment: entities visible to a member (unassigned, directly assigned, or via a group). */
export function assignedToMemberSql(type: AssignEntity, alias: string, memberParam = '@member') {
  return `(
    NOT EXISTS (SELECT 1 FROM assignments a WHERE a.entity_type = '${type}' AND a.entity_id = ${alias}.id)
    OR EXISTS (SELECT 1 FROM assignments a WHERE a.entity_type = '${type}' AND a.entity_id = ${alias}.id AND a.member_id = ${memberParam})
    OR EXISTS (SELECT 1 FROM assignments a JOIN group_members gm ON gm.group_id = a.group_id
               WHERE a.entity_type = '${type}' AND a.entity_id = ${alias}.id AND gm.member_id = ${memberParam})
  )`;
}

export const emptyAssignees = (): Assignees => ({ member_ids: [], group_ids: [] });

// ---------- Members & groups ----------

export function listMembers(includeArchived = false): Member[] {
  const rows = db.prepare(`SELECT * FROM members ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY sort_order, id`).all() as any[];
  return rows.map((r) => ({ ...r, archived: !!r.archived }));
}

export function getMember(id: number): Member | undefined {
  const r = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as any;
  return r ? { ...r, archived: !!r.archived } : undefined;
}

export function listGroups(): Group[] {
  const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order, id').all() as any[];
  const members = db.prepare('SELECT group_id, member_id FROM group_members').all() as { group_id: number; member_id: number }[];
  return groups.map((g) => ({ ...g, member_ids: members.filter((m) => m.group_id === g.id).map((m) => m.member_id) }));
}

// ---------- Tasks ----------

export function mapTask(r: any, assignees?: Assignees): Task {
  return {
    ...r,
    recurrence: r.recurrence ? (JSON.parse(r.recurrence) as Recurrence) : null,
    assignees: assignees ?? emptyAssignees(),
  };
}

export const TASK_ORDER = `ORDER BY
  CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
  CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, t.due_time,
  CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
  t.sort_order, t.id`;

export function loadTasks(where: string, params: Record<string, unknown> = {}, order = TASK_ORDER): Task[] {
  const rows = db.prepare(`SELECT t.* FROM tasks t WHERE ${where} ${order}`).all(params) as any[];
  const assignees = getAssignees('task', rows.map((r) => r.id));
  return rows.map((r) => mapTask(r, assignees.get(r.id)));
}

export function getTask(id: number): Task | undefined {
  return loadTasks('t.id = @id', { id })[0];
}

/** Compute the next due date for a recurring task. */
export function nextDueDate(from: string, rec: Recurrence): string {
  const [y, m, d] = from.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const interval = Math.max(1, rec.interval || 1);
  if (rec.freq === 'daily') date.setUTCDate(date.getUTCDate() + interval);
  else if (rec.freq === 'weekly') {
    const days = (rec.weekdays ?? []).filter((n) => n >= 0 && n <= 6).sort();
    if (days.length) {
      // Next selected weekday after `from`, wrapping to the next interval week.
      const cur = date.getUTCDay();
      const later = days.find((w) => w > cur);
      if (later !== undefined) date.setUTCDate(date.getUTCDate() + (later - cur));
      else date.setUTCDate(date.getUTCDate() + (7 * interval - cur + days[0]));
    } else date.setUTCDate(date.getUTCDate() + 7 * interval);
  } else if (rec.freq === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + interval);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else if (rec.freq === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + interval);
  return date.toISOString().slice(0, 10);
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- Shopping ----------

export function mapShoppingItem(r: any, assignees?: Assignees): ShoppingItem {
  return { ...r, assignees: assignees ?? emptyAssignees() };
}

export const SHOPPING_ORDER = `ORDER BY CASE WHEN s.checked_at IS NULL THEN 0 ELSE 1 END, s.category, s.sort_order, s.id`;

export function loadShoppingItems(where: string, params: Record<string, unknown> = {}): ShoppingItem[] {
  const rows = db.prepare(`SELECT s.* FROM shopping_items s WHERE ${where} ${SHOPPING_ORDER}`).all(params) as any[];
  const assignees = getAssignees('shopping_item', rows.map((r) => r.id));
  return rows.map((r) => mapShoppingItem(r, assignees.get(r.id)));
}

export function getShoppingItem(id: number): ShoppingItem | undefined {
  return loadShoppingItems('s.id = @id', { id })[0];
}

export function rememberPurchase(name: string, category: string, unit: string) {
  db.prepare(
    `INSERT INTO shopping_history (name, category, unit, times, last_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(name) DO UPDATE SET times = times + 1, last_at = excluded.last_at,
       category = CASE WHEN excluded.category <> '' THEN excluded.category ELSE category END,
       unit = CASE WHEN excluded.unit <> '' THEN excluded.unit ELSE unit END`,
  ).run(name.trim(), category, unit, nowIso());
}

export function touch(table: 'tasks' | 'projects' | 'shopping_items', id: number) {
  db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
}
