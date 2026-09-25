import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { handler, parse, onlySupplied, idParam, notFound, badRequest, zAssignees, zIdList } from '../http.js';
import { actorFrom, logChange, type Actor } from '../context.js';
import { loadShoppingItems, getShoppingItem, setAssignees, assignedToMemberSql, rememberPurchase } from '../repo.js';
import { assertKidMay } from '../permissions.js';
import type { ShoppingItem, ShoppingList } from '../../shared/types.js';

export const shopping = Router();

// ---------- Lists ----------

export function listShoppingLists(): ShoppingList[] {
  return db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM shopping_items s WHERE s.list_id = l.id AND s.checked_at IS NULL) AS open_count
       FROM shopping_lists l ORDER BY CASE WHEN l.project_id IS NULL THEN 0 ELSE 1 END, l.sort_order, l.id`,
    )
    .all() as ShoppingList[];
}

export function getShoppingList(id: number): ShoppingList | undefined {
  return listShoppingLists().find((l) => l.id === id);
}

shopping.get('/shopping/lists', handler(() => listShoppingLists()));

const listNameBody = z.object({ name: z.string().trim().min(1).max(60) });

export function createShoppingList(input: unknown, actor: Actor): ShoppingList {
  assertKidMay(actor, 'shopping');
  const body = parse(listNameBody, input);
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM shopping_lists WHERE project_id IS NULL').get() as any).n;
  const id = Number(db.prepare('INSERT INTO shopping_lists (name, sort_order) VALUES (?, ?)').run(body.name, order).lastInsertRowid);
  logChange(actor, 'created', 'shopping', id, `Created shopping list "${body.name}"`);
  return getShoppingList(id)!;
}

shopping.post(
  '/shopping/lists',
  handler((req, res) => {
    res.status(201);
    return createShoppingList(req.body, actorFrom(req));
  }),
);

export function renameShoppingList(id: number, input: unknown, actor: Actor): ShoppingList {
  const current = getShoppingList(id);
  if (!current) throw notFound('List not found');
  assertKidMay(actor, 'shopping');
  const body = parse(listNameBody, input);
  db.prepare('UPDATE shopping_lists SET name = ? WHERE id = ?').run(body.name, id);
  logChange(actor, 'updated', 'shopping', id, `Renamed list to "${body.name}"`);
  return getShoppingList(id)!;
}

shopping.patch('/shopping/lists/:id', handler((req) => renameShoppingList(idParam(req), req.body, actorFrom(req))));

export function deleteShoppingList(id: number, actor: Actor) {
  const current = getShoppingList(id);
  if (!current) throw notFound('List not found');
  if (id === 1) throw badRequest('The Household list cannot be deleted');
  if (current.project_id) throw badRequest('Project lists are removed with their project');
  assertKidMay(actor, 'shopping');
  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(id);
  cleanAssignments();
  logChange(actor, 'deleted', 'shopping', id, `Deleted list "${current.name}"`);
}

shopping.delete(
  '/shopping/lists/:id',
  handler((req, res) => {
    deleteShoppingList(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

// ---------- Items ----------

const itemBody = z.object({
  list_id: z.number().int().positive().default(1),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().nullable().default(null),
  unit: z.string().trim().max(20).default(''),
  category: z.string().trim().max(40).default(''),
  notes: z.string().max(2000).default(''),
  price: z.number().min(0).nullable().default(null),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignees: zAssignees,
});

const itemQuery = z.object({
  list: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'checked', 'all']).default('all'),
  member: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

export function queryShoppingItems(q: z.infer<typeof itemQuery>): ShoppingItem[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (q.list) (where.push('s.list_id = @list'), (params.list = q.list));
  if (q.status === 'open') where.push('s.checked_at IS NULL');
  if (q.status === 'checked') where.push('s.checked_at IS NOT NULL');
  if (q.member) (where.push(assignedToMemberSql('shopping_item', 's')), (params.member = q.member));
  if (q.q) (where.push('s.name LIKE @q'), (params.q = `%${q.q}%`));
  return loadShoppingItems(where.length ? where.join(' AND ') : '1=1', params);
}

shopping.get('/shopping/items', handler((req) => queryShoppingItems(parse(itemQuery, req.query))));

export function createShoppingItem(input: z.input<typeof itemBody>, actor: Actor): ShoppingItem {
  const body = parse(itemBody, input);
  if (!db.prepare('SELECT 1 FROM shopping_lists WHERE id = ?').get(body.list_id)) throw badRequest('List does not exist');
  // If the same unchecked item already exists on this list, bump the quantity instead of duplicating.
  const existing = db
    .prepare('SELECT id, quantity FROM shopping_items WHERE list_id = ? AND checked_at IS NULL AND name = ? COLLATE NOCASE')
    .get(body.list_id, body.name) as { id: number; quantity: number | null } | undefined;
  if (existing) {
    const qty = (existing.quantity ?? 1) + (body.quantity ?? 1);
    db.prepare('UPDATE shopping_items SET quantity = ?, updated_at = ? WHERE id = ?').run(qty, nowIso(), existing.id);
    const item = getShoppingItem(existing.id)!;
    logChange(actor, 'updated', 'shopping', item.id, `Bumped "${item.name}" to ${qty}`);
    return item;
  }
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM shopping_items WHERE list_id = ?').get(body.list_id) as any).n;
  const hist = db.prepare('SELECT category, unit FROM shopping_history WHERE name = ?').get(body.name) as { category: string; unit: string } | undefined;
  const id = Number(
    db
      .prepare(
        `INSERT INTO shopping_items (list_id, name, quantity, unit, category, notes, price, priority, sort_order, created_by)
         VALUES (@list_id, @name, @quantity, @unit, @category, @notes, @price, @priority, @order, @created_by)`,
      )
      .run({
        ...body,
        unit: body.unit || hist?.unit || '',
        category: body.category || hist?.category || '',
        order,
        created_by: actor.type === 'member' ? actor.id : null,
      }).lastInsertRowid,
  );
  setAssignees('shopping_item', id, body.assignees);
  const item = getShoppingItem(id)!;
  logChange(actor, 'created', 'shopping', id, `Added "${item.name}" to the shopping list`);
  return item;
}

shopping.post(
  '/shopping/items',
  handler((req, res) => {
    res.status(201);
    return createShoppingItem(req.body, actorFrom(req));
  }),
);

export function updateShoppingItem(id: number, input: unknown, actor: Actor): ShoppingItem {
  const current = getShoppingItem(id);
  if (!current) throw notFound('Item not found');
  const body = onlySupplied(input, parse(itemBody.partial().extend({ checked: z.boolean().optional() }), input));
  // Anyone can tick an item off; changing it needs to be yours (or kids allowed to).
  if (Object.keys(body).some((k) => k !== 'checked')) assertKidMay(actor, 'shopping', current.created_by);
  const next = { ...current, ...body };
  if (body.list_id && !db.prepare('SELECT 1 FROM shopping_lists WHERE id = ?').get(body.list_id)) throw badRequest('List does not exist');
  db.prepare(
    `UPDATE shopping_items SET list_id=@list_id, name=@name, quantity=@quantity, unit=@unit, category=@category, notes=@notes, price=@price, priority=@priority, updated_at=@now WHERE id=@id`,
  ).run({ id, list_id: next.list_id, name: next.name, quantity: next.quantity, unit: next.unit, category: next.category, notes: next.notes, price: next.price, priority: next.priority, now: nowIso() });
  if (body.assignees) setAssignees('shopping_item', id, body.assignees);
  if (body.checked !== undefined && body.checked !== !!current.checked_at) return setChecked(id, body.checked, actor);
  const item = getShoppingItem(id)!;
  logChange(actor, 'updated', 'shopping', id, `Updated "${item.name}"`);
  return item;
}

shopping.patch('/shopping/items/:id', handler((req) => updateShoppingItem(idParam(req), req.body, actorFrom(req))));

export function setChecked(id: number, checked: boolean, actor: Actor): ShoppingItem {
  const current = getShoppingItem(id);
  if (!current) throw notFound('Item not found');
  db.prepare('UPDATE shopping_items SET checked_at = ?, checked_by = ?, updated_at = ? WHERE id = ?').run(
    checked ? nowIso() : null,
    checked && actor.type === 'member' ? actor.id : null,
    nowIso(),
    id,
  );
  if (checked) rememberPurchase(current.name, current.category, current.unit);
  const item = getShoppingItem(id)!;
  logChange(actor, 'updated', 'shopping', id, checked ? `Picked up "${item.name}"` : `Put "${item.name}" back on the list`);
  return item;
}

shopping.post('/shopping/items/:id/check', handler((req) => setChecked(idParam(req), true, actorFrom(req))));
shopping.post('/shopping/items/:id/uncheck', handler((req) => setChecked(idParam(req), false, actorFrom(req))));

export function deleteShoppingItem(id: number, actor: Actor) {
  const current = getShoppingItem(id);
  if (!current) throw notFound('Item not found');
  assertKidMay(actor, 'shopping', current.created_by);
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
  cleanAssignments();
  logChange(actor, 'deleted', 'shopping', id, `Removed "${current.name}" from the shopping list`);
}

shopping.delete(
  '/shopping/items/:id',
  handler((req, res) => {
    deleteShoppingItem(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

shopping.post(
  '/shopping/items/reorder',
  handler((req) => {
    const { ids } = parse(z.object({ ids: zIdList }), req.body);
    assertKidMay(actorFrom(req), 'shopping');
    const upd = db.prepare('UPDATE shopping_items SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
    logChange(actorFrom(req), 'reordered', 'shopping', null, 'Reordered shopping items');
    return { ok: true };
  }),
);

export function clearChecked(listId: number, actor: Actor) {
  const info = db.prepare('DELETE FROM shopping_items WHERE list_id = ? AND checked_at IS NOT NULL').run(listId);
  cleanAssignments();
  logChange(actor, 'deleted', 'shopping', listId, `Cleared ${info.changes} picked-up items`);
  return { deleted: info.changes };
}

shopping.post('/shopping/lists/:id/clear-checked', handler((req) => clearChecked(idParam(req), actorFrom(req))));

/** Frequently bought items, for quick-add suggestions. */
shopping.get(
  '/shopping/suggestions',
  handler((req) => {
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
    return db
      .prepare(`SELECT name, category, unit, times FROM shopping_history ${q ? 'WHERE name LIKE @q' : ''} ORDER BY times DESC, last_at DESC LIMIT 12`)
      .all(q ? { q: `%${q}%` } : {});
  }),
);

function cleanAssignments() {
  db.prepare("DELETE FROM assignments WHERE entity_type = 'shopping_item' AND entity_id NOT IN (SELECT id FROM shopping_items)").run();
}

export { itemBody as shoppingItemBody, itemQuery as shoppingItemQuery };
