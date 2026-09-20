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

/** A human- and agent-readable map of the API. */
misc.get(
  '/',
  handler(() => ({
    name: 'Lar API',
    version: 1,
    docs: 'https://github.com/fernando-granco/Lar#api',
    identify: 'Send X-Lar-Member: <id> to act as a person (plus X-Lar-Unlock: <token> from POST /auth/unlock if they set a password) or X-Lar-Agent: <name> to act as an agent (plus the LAR_API_KEY when configured).',
    mcp: '/mcp (Model Context Protocol, Streamable HTTP, stateless)',
    routes: {
      household: ['GET /household', 'PATCH /household/settings', 'POST /members', 'PATCH /members/:id', 'DELETE /members/:id', 'POST /groups', 'PATCH /groups/:id', 'DELETE /groups/:id'],
      tasks: ['GET /tasks?status=open|done|all&member=<id>&project=<id>|none&due=today|overdue|week|none|scheduled&q=', 'GET /tasks/:id', 'POST /tasks', 'PATCH /tasks/:id', 'POST /tasks/:id/complete', 'POST /tasks/:id/reopen', 'DELETE /tasks/:id', 'POST /tasks/reorder', 'POST /tasks/clear-completed'],
      shopping: ['GET /shopping/lists', 'POST /shopping/lists', 'PATCH /shopping/lists/:id', 'DELETE /shopping/lists/:id', 'POST /shopping/lists/:id/clear-checked', 'GET /shopping/items?list=<id>&status=open|checked|all&member=<id>', 'POST /shopping/items', 'PATCH /shopping/items/:id', 'POST /shopping/items/:id/check', 'POST /shopping/items/:id/uncheck', 'DELETE /shopping/items/:id', 'GET /shopping/suggestions?q='],
      projects: ['GET /projects?status=open|active|planned|idea|on_hold|done|all&member=<id>', 'GET /projects/:id', 'POST /projects', 'PATCH /projects/:id', 'DELETE /projects/:id', 'POST /projects/:id/milestones', 'PATCH /milestones/:id', 'DELETE /milestones/:id', 'POST /projects/:id/expenses', 'PATCH /expenses/:id', 'DELETE /expenses/:id', 'POST /projects/:id/links', 'PATCH /links/:id', 'DELETE /links/:id'],
      recipes: ['GET /recipes?q=', 'GET /recipes/:id', 'POST /recipes', 'PATCH /recipes/:id', 'DELETE /recipes/:id', 'GET /menu?from=&to=', 'POST /menu', 'DELETE /menu/:id'],
      other: ['GET /summary', 'GET /activity?limit=&entity=&entity_id=', 'GET /events (server-sent events)', 'GET /health'],
    },
  })),
);

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

misc.get(
  '/health',
  handler(() => ({
    ok: true,
    clients: clientCount(),
    agent_api_protected: Boolean(process.env.LAR_API_KEY?.trim()),
    time: new Date().toISOString(),
  })),
);
