import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { handler, parse, idParam, notFound, zDate, zColor, zIdList } from '../http.js';
import { actorFrom, logChange, type Actor } from '../context.js';
import { loadTasks, loadShoppingItems, todayIso } from '../repo.js';
import type { Project, ProjectDetail, Milestone, Expense, ProjectLink } from '../../shared/types.js';

export const projects = Router();

const PROJECT_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS task_done_count,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id) AS milestone_count,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.done_at IS NOT NULL) AS milestone_done_count,
    (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.project_id = p.id) AS spent,
    (SELECT COUNT(*) FROM shopping_items s JOIN shopping_lists l ON l.id = s.list_id WHERE l.project_id = p.id AND s.checked_at IS NULL) AS shopping_open_count
  FROM projects p`;

const PROJECT_ORDER = `ORDER BY p.archived,
  CASE p.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'idea' THEN 2 WHEN 'on_hold' THEN 3 ELSE 4 END,
  CASE p.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
  p.sort_order, p.id`;

function mapProject(r: any): Project {
  const nextMs = db
    .prepare('SELECT id, title, due_date FROM milestones WHERE project_id = ? AND done_at IS NULL ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, sort_order LIMIT 1')
    .get(r.id) as Project['next_milestone'];
  const member_ids = (db.prepare('SELECT member_id FROM project_members WHERE project_id = ?').all(r.id) as any[]).map((m) => m.member_id);
  return { ...r, archived: !!r.archived, member_ids, next_milestone: nextMs ?? null };
}

const listQuery = z.object({
  status: z.enum(['idea', 'planned', 'active', 'on_hold', 'done', 'open', 'all']).default('open'),
  archived: z.coerce.boolean().default(false),
  member: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

export function queryProjects(q: z.infer<typeof listQuery>): Project[] {
  const where: string[] = ['p.archived = @archived'];
  const params: Record<string, unknown> = { archived: q.archived ? 1 : 0 };
  if (q.status === 'open') where.push("p.status <> 'done'");
  else if (q.status !== 'all') (where.push('p.status = @status'), (params.status = q.status));
  if (q.member) {
    where.push('(p.owner_id = @member OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_id = @member))');
    params.member = q.member;
  }
  if (q.q) (where.push('(p.name LIKE @q OR p.description LIKE @q)'), (params.q = `%${q.q}%`));
  const rows = db.prepare(`${PROJECT_SELECT} WHERE ${where.join(' AND ')} ${PROJECT_ORDER}`).all(params) as any[];
  return rows.map(mapProject);
}

export function getProject(id: number): Project | undefined {
  const r = db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id);
  return r ? mapProject(r) : undefined;
}

export function getProjectDetail(id: number): ProjectDetail | undefined {
  const project = getProject(id);
  if (!project) return undefined;
  let list = db.prepare('SELECT * FROM shopping_lists WHERE project_id = ?').get(id) as any;
  if (!list) {
    db.prepare('INSERT INTO shopping_lists (name, project_id) VALUES (?, ?)').run(project.name, id);
    list = db.prepare('SELECT * FROM shopping_lists WHERE project_id = ?').get(id);
  }
  return {
    ...project,
    milestones: db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, sort_order, id').all(id) as Milestone[],
    tasks: loadTasks('t.project_id = @id', { id }),
    shopping_list: list,
    shopping_items: loadShoppingItems('s.list_id = @list', { list: list.id }),
    expenses: db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY date DESC, id DESC').all(id) as Expense[],
    links: db.prepare('SELECT * FROM project_links WHERE project_id = ? ORDER BY sort_order, id').all(id) as ProjectLink[],
  };
}

projects.get('/projects', handler((req) => queryProjects(parse(listQuery, req.query))));

projects.get(
  '/projects/:id',
  handler((req) => {
    const p = getProjectDetail(idParam(req));
    if (!p) throw notFound('Project not found');
    return p;
  }),
);

const projectBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: z.enum(['idea', 'planned', 'active', 'on_hold', 'done']).default('planned'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  color: zColor.default('#db744f'),
  icon: z.string().trim().max(40).default('hammer'),
  owner_id: z.number().int().positive().nullable().default(null),
  member_ids: zIdList.optional(),
  start_date: zDate.nullable().default(null),
  target_date: zDate.nullable().default(null),
  budget: z.number().min(0).nullable().default(null),
  notes: z.string().max(20000).default(''),
});

function setProjectMembers(projectId: number, memberIds: number[]) {
  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
  const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, member_id) VALUES (?, ?)');
  for (const m of new Set(memberIds)) ins.run(projectId, m);
}

export function createProject(input: z.input<typeof projectBody>, actor: Actor): ProjectDetail {
  const body = parse(projectBody, input);
  const owner = body.owner_id ?? (actor.type === 'member' ? actor.id : null);
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM projects').get() as any).n;
  const id = Number(
    db
      .prepare(
        `INSERT INTO projects (name, description, status, priority, color, icon, owner_id, start_date, target_date, budget, notes, sort_order, created_by, completed_at)
         VALUES (@name, @description, @status, @priority, @color, @icon, @owner, @start_date, @target_date, @budget, @notes, @order, @created_by, @completed_at)`,
      )
      .run({
        ...body,
        owner,
        order,
        created_by: actor.type === 'member' ? actor.id : null,
        completed_at: body.status === 'done' ? nowIso() : null,
      }).lastInsertRowid,
  );
  setProjectMembers(id, body.member_ids ?? (owner ? [owner] : []));
  db.prepare('INSERT INTO shopping_lists (name, project_id) VALUES (?, ?)').run(body.name, id);
  logChange(actor, 'created', 'project', id, `Started project "${body.name}"`);
  return getProjectDetail(id)!;
}

projects.post(
  '/projects',
  handler((req, res) => {
    res.status(201);
    return createProject(req.body, actorFrom(req));
  }),
);

export function updateProject(id: number, input: unknown, actor: Actor): ProjectDetail {
  const current = getProject(id);
  if (!current) throw notFound('Project not found');
  const body = parse(projectBody.partial().extend({ archived: z.boolean().optional() }), input);
  const next = { ...current, ...body };
  const completed_at = next.status === 'done' ? current.completed_at ?? nowIso() : null;
  db.prepare(
    `UPDATE projects SET name=@name, description=@description, status=@status, priority=@priority, color=@color, icon=@icon, owner_id=@owner_id,
       start_date=@start_date, target_date=@target_date, budget=@budget, notes=@notes, archived=@archived, completed_at=@completed_at, updated_at=@now WHERE id=@id`,
  ).run({
    id,
    name: next.name,
    description: next.description,
    status: next.status,
    priority: next.priority,
    color: next.color,
    icon: next.icon,
    owner_id: next.owner_id,
    start_date: next.start_date,
    target_date: next.target_date,
    budget: next.budget,
    notes: next.notes,
    archived: next.archived ? 1 : 0,
    completed_at,
    now: nowIso(),
  });
  if (body.member_ids) setProjectMembers(id, body.member_ids);
  if (body.name) db.prepare('UPDATE shopping_lists SET name = ? WHERE project_id = ?').run(body.name, id);
  const what = body.status && body.status !== current.status ? `Moved "${next.name}" to ${next.status.replace('_', ' ')}` : `Updated project "${next.name}"`;
  logChange(actor, 'updated', 'project', id, what);
  return getProjectDetail(id)!;
}

projects.patch('/projects/:id', handler((req) => updateProject(idParam(req), req.body, actorFrom(req))));

export function deleteProject(id: number, actor: Actor) {
  const current = getProject(id);
  if (!current) throw notFound('Project not found');
  db.transaction(() => {
    db.prepare("DELETE FROM assignments WHERE entity_type = 'task' AND entity_id IN (SELECT id FROM tasks WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM assignments WHERE entity_type = 'shopping_item' AND entity_id IN (SELECT s.id FROM shopping_items s JOIN shopping_lists l ON l.id = s.list_id WHERE l.project_id = ?)").run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  })();
  logChange(actor, 'deleted', 'project', id, `Deleted project "${current.name}"`);
}

projects.delete(
  '/projects/:id',
  handler((req, res) => {
    deleteProject(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

projects.post(
  '/projects/reorder',
  handler((req) => {
    const { ids } = parse(z.object({ ids: zIdList }), req.body);
    const upd = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
    logChange(actorFrom(req), 'reordered', 'project', null, 'Reordered projects');
    return { ok: true };
  }),
);

// ---------- Milestones ----------

const milestoneBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(''),
  due_date: zDate.nullable().default(null),
});

const getMilestone = (id: number) => db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;

export function createMilestone(projectId: number, input: z.input<typeof milestoneBody>, actor: Actor): Milestone {
  if (!getProject(projectId)) throw notFound('Project not found');
  const body = parse(milestoneBody, input);
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM milestones WHERE project_id = ?').get(projectId) as any).n;
  const id = Number(
    db.prepare('INSERT INTO milestones (project_id, title, description, due_date, sort_order) VALUES (?, ?, ?, ?, ?)').run(projectId, body.title, body.description, body.due_date, order).lastInsertRowid,
  );
  logChange(actor, 'created', 'project', projectId, `Added milestone "${body.title}"`);
  return getMilestone(id)!;
}

projects.post(
  '/projects/:id/milestones',
  handler((req, res) => {
    res.status(201);
    return createMilestone(idParam(req), req.body, actorFrom(req));
  }),
);

export function updateMilestone(id: number, input: unknown, actor: Actor): Milestone {
  const current = getMilestone(id);
  if (!current) throw notFound('Milestone not found');
  const body = parse(milestoneBody.partial().extend({ done: z.boolean().optional(), sort_order: z.number().int().optional() }), input);
  const done_at = body.done === undefined ? current.done_at : body.done ? current.done_at ?? nowIso() : null;
  db.prepare('UPDATE milestones SET title = ?, description = ?, due_date = ?, done_at = ?, sort_order = ? WHERE id = ?').run(
    body.title ?? current.title,
    body.description ?? current.description,
    body.due_date === undefined ? current.due_date : body.due_date,
    done_at,
    body.sort_order ?? current.sort_order,
    id,
  );
  const ms = getMilestone(id)!;
  const summary = body.done === true ? `Reached milestone "${ms.title}"` : body.done === false ? `Reopened milestone "${ms.title}"` : `Updated milestone "${ms.title}"`;
  logChange(actor, 'updated', 'project', ms.project_id, summary);
  return ms;
}

projects.patch('/milestones/:id', handler((req) => updateMilestone(idParam(req), req.body, actorFrom(req))));

export function deleteMilestone(id: number, actor: Actor) {
  const current = getMilestone(id);
  if (!current) throw notFound('Milestone not found');
  db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
  logChange(actor, 'deleted', 'project', current.project_id, `Deleted milestone "${current.title}"`);
}

projects.delete(
  '/milestones/:id',
  handler((req, res) => {
    deleteMilestone(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

// ---------- Expenses ----------

const expenseBody = z.object({
  title: z.string().trim().min(1).max(160),
  amount: z.number().min(0),
  date: zDate.default(() => todayIso()),
  category: z.string().trim().max(40).default(''),
  notes: z.string().max(2000).default(''),
  shopping_item_id: z.number().int().positive().nullable().default(null),
});

const getExpense = (id: number) => db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense | undefined;

export function createExpense(projectId: number, input: z.input<typeof expenseBody>, actor: Actor): Expense {
  if (!getProject(projectId)) throw notFound('Project not found');
  const body = parse(expenseBody, input);
  const id = Number(
    db
      .prepare('INSERT INTO expenses (project_id, title, amount, date, category, notes, shopping_item_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, body.title, body.amount, body.date, body.category, body.notes, body.shopping_item_id, actor.type === 'member' ? actor.id : null).lastInsertRowid,
  );
  logChange(actor, 'created', 'project', projectId, `Logged expense "${body.title}" (${body.amount})`);
  return getExpense(id)!;
}

projects.post(
  '/projects/:id/expenses',
  handler((req, res) => {
    res.status(201);
    return createExpense(idParam(req), req.body, actorFrom(req));
  }),
);

export function updateExpense(id: number, input: unknown, actor: Actor): Expense {
  const current = getExpense(id);
  if (!current) throw notFound('Expense not found');
  const body = parse(expenseBody.partial(), input);
  const next = { ...current, ...body };
  db.prepare('UPDATE expenses SET title = ?, amount = ?, date = ?, category = ?, notes = ?, shopping_item_id = ? WHERE id = ?').run(
    next.title, next.amount, next.date, next.category, next.notes, next.shopping_item_id, id,
  );
  logChange(actor, 'updated', 'project', current.project_id, `Updated expense "${next.title}"`);
  return getExpense(id)!;
}

projects.patch('/expenses/:id', handler((req) => updateExpense(idParam(req), req.body, actorFrom(req))));

export function deleteExpense(id: number, actor: Actor) {
  const current = getExpense(id);
  if (!current) throw notFound('Expense not found');
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  logChange(actor, 'deleted', 'project', current.project_id, `Deleted expense "${current.title}"`);
}

projects.delete(
  '/expenses/:id',
  handler((req, res) => {
    deleteExpense(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

// ---------- Links ----------

const linkBody = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
});

const getLink = (id: number) => db.prepare('SELECT * FROM project_links WHERE id = ?').get(id) as ProjectLink | undefined;

projects.post(
  '/projects/:id/links',
  handler((req, res) => {
    const projectId = idParam(req);
    if (!getProject(projectId)) throw notFound('Project not found');
    const body = parse(linkBody, req.body);
    const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM project_links WHERE project_id = ?').get(projectId) as any).n;
    const id = Number(db.prepare('INSERT INTO project_links (project_id, label, url, sort_order) VALUES (?, ?, ?, ?)').run(projectId, body.label, body.url, order).lastInsertRowid);
    logChange(actorFrom(req), 'updated', 'project', projectId, `Added link "${body.label}"`);
    res.status(201);
    return getLink(id);
  }),
);

projects.patch(
  '/links/:id',
  handler((req) => {
    const id = idParam(req);
    const current = getLink(id);
    if (!current) throw notFound('Link not found');
    const body = parse(linkBody.partial(), req.body);
    db.prepare('UPDATE project_links SET label = ?, url = ? WHERE id = ?').run(body.label ?? current.label, body.url ?? current.url, id);
    logChange(actorFrom(req), 'updated', 'project', current.project_id, `Updated link "${body.label ?? current.label}"`);
    return getLink(id);
  }),
);

projects.delete(
  '/links/:id',
  handler((req, res) => {
    const id = idParam(req);
    const current = getLink(id);
    if (!current) throw notFound('Link not found');
    db.prepare('DELETE FROM project_links WHERE id = ?').run(id);
    logChange(actorFrom(req), 'updated', 'project', current.project_id, `Removed link "${current.label}"`);
    res.status(204);
  }),
);

export { projectBody, milestoneBody, expenseBody, listQuery as projectListQuery };
