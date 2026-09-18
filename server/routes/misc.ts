import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { handler, parse } from '../http.js';
import { subscribe, clientCount } from '../events.js';
import { todayIso } from '../repo.js';
import type { Activity, Summary } from '../../shared/types.js';

export const misc = Router();

export function summary(): Summary {
  const today = todayIso();
  const one = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as any).n as number;
  return {
    tasks_open: one("SELECT COUNT(*) AS n FROM tasks WHERE status = 'open' AND project_id IS NULL"),
    tasks_due_today: one("SELECT COUNT(*) AS n FROM tasks WHERE status = 'open' AND due_date = ?", today),
    tasks_overdue: one("SELECT COUNT(*) AS n FROM tasks WHERE status = 'open' AND due_date < ?", today),
    shopping_open: one('SELECT COUNT(*) AS n FROM shopping_items WHERE checked_at IS NULL AND list_id = 1'),
    projects_active: one("SELECT COUNT(*) AS n FROM projects WHERE status = 'active' AND archived = 0"),
  };
}

misc.get('/summary', handler(() => summary()));

misc.get(
  '/activity',
  handler((req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), entity: z.string().optional(), entity_id: z.coerce.number().int().optional() }), req.query);
    const where: string[] = [];
    const params: Record<string, unknown> = { limit: q.limit };
    if (q.entity) (where.push('entity_type = @entity'), (params.entity = q.entity));
    if (q.entity_id) (where.push('entity_id = @entity_id'), (params.entity_id = q.entity_id));
    const rows = db.prepare(`SELECT * FROM activity ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT @limit`).all(params) as any[];
    return rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })) as Activity[];
  }),
);

misc.get('/events', (_req, res) => subscribe(res));

misc.get('/health', handler(() => ({ ok: true, clients: clientCount(), time: new Date().toISOString() })));
