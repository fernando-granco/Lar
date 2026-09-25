import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { handler, parse, onlySupplied, idParam, notFound, zDate, zColor, zIdList } from '../http.js';
import { actorFrom, logChange, type Actor } from '../context.js';
import { loadTasks, loadShoppingItems, todayIso } from '../repo.js';
import { assertKidMay } from '../permissions.js';
import type { Project, ProjectDetail, Milestone, Expense, ProjectLink, ProjectNote, TodayNote } from '../../shared/types.js';

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

/** Kids may change a project they started or own; others need the adults' permission. */
function assertMayChangeProject(actor: Actor, projectId: number) {
  const row = db.prepare('SELECT created_by, owner_id FROM projects WHERE id = ?').get(projectId) as { created_by: number | null; owner_id: number | null } | undefined;
  if (!row) return;
  assertKidMay(actor, 'projects', actor.id !== null && (row.created_by === actor.id || row.owner_id === actor.id) ? actor.id : row.created_by);
}

// ---------- Notes ----------

const EVERYONE: Actor = { type: 'agent', id: null, name: '' };

/**
 * Which notes a caller can see: notes without a people list are for everyone,
 * the author always sees their own, and agents see all of them (they act for
 * the household). A caller who has not picked a person sees only shared notes.
 */
function noteVisibleSql(viewer: Actor, alias = 'n') {
  if (viewer.type === 'agent') return { sql: '1=1', params: {} };
  const shared = `NOT EXISTS (SELECT 1 FROM project_note_members nm WHERE nm.note_id = ${alias}.id)`;
  if (viewer.type !== 'member' || !viewer.id) return { sql: shared, params: {} };
  return {
    sql: `(${shared} OR ${alias}.created_by = @viewer OR EXISTS (SELECT 1 FROM project_note_members nm WHERE nm.note_id = ${alias}.id AND nm.member_id = @viewer))`,
    params: { viewer: viewer.id },
  };
}

function mapNotes<T extends ProjectNote>(rows: any[]): T[] {
  if (!rows.length) return [];
  const members = db
    .prepare(`SELECT note_id, member_id FROM project_note_members WHERE note_id IN (${rows.map(() => '?').join(',')})`)
    .all(...rows.map((r) => r.id)) as { note_id: number; member_id: number }[];
  return rows.map((r) => ({
    ...r,
    pinned: !!r.pinned,
    show_on_overview: !!r.show_on_overview,
    show_on_today: !!r.show_on_today,
    member_ids: members.filter((m) => m.note_id === r.id).map((m) => m.member_id),
  }));
}

export function listProjectNotes(projectId: number, viewer: Actor): ProjectNote[] {
  const vis = noteVisibleSql(viewer);
  return mapNotes(db.prepare(`SELECT n.* FROM project_notes n WHERE n.project_id = @project AND ${vis.sql} ORDER BY n.pinned DESC, n.sort_order, n.id`).all({ project: projectId, ...vis.params }) as any[]);
}

export function getProjectNote(id: number, viewer: Actor): ProjectNote | undefined {
  const vis = noteVisibleSql(viewer);
  return mapNotes(db.prepare(`SELECT n.* FROM project_notes n WHERE n.id = @id AND ${vis.sql}`).all({ id, ...vis.params }) as any[])[0];
}

/** Notes people chose to show on their Today dashboard, from projects that are not archived. */
export function todayNotes(viewer: Actor): TodayNote[] {
  const vis = noteVisibleSql(viewer);
  const rows = db
    .prepare(
      `SELECT n.*, p.name AS project_name, p.color AS project_color FROM project_notes n JOIN projects p ON p.id = n.project_id
       WHERE n.show_on_today = 1 AND p.archived = 0 AND ${vis.sql} ORDER BY n.pinned DESC, n.updated_at DESC`,
    )
    .all(vis.params) as any[];
  return mapNotes<TodayNote>(rows);
}

const noteBody = z.object({
  title: z.string().trim().max(160).default(''),
  body: z.string().max(20000).default(''),
  color: z.union([zColor, z.literal('')]).default(''),
  pinned: z.boolean().default(false),
  show_on_overview: z.boolean().default(true),
  show_on_today: z.boolean().default(false),
  member_ids: zIdList,
  sort_order: z.number().int().optional(),
});

function setNoteMembers(noteId: number, memberIds: number[]) {
  db.prepare('DELETE FROM project_note_members WHERE note_id = ?').run(noteId);
  const ins = db.prepare('INSERT OR IGNORE INTO project_note_members (note_id, member_id) VALUES (?, ?)');
  for (const m of new Set(memberIds)) if (db.prepare('SELECT 1 FROM members WHERE id = ?').get(m)) ins.run(noteId, m);
}

/** Private notes stay private in the shared activity log too. */
const noteLabel = (n: { title: string; member_ids: number[] }) => (n.member_ids.length ? 'a private note' : n.title ? `note "${n.title}"` : 'a note');

export function createProjectNote(projectId: number, input: unknown, actor: Actor): ProjectNote {
  const project = getProject(projectId);
  if (!project) throw notFound('Project not found');
  const body = parse(noteBody, input);
  const order = body.sort_order ?? (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM project_notes WHERE project_id = ?').get(projectId) as any).n;
  const id = Number(
    db
      .prepare('INSERT INTO project_notes (project_id, title, body, color, pinned, show_on_overview, show_on_today, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, body.title, body.body, body.color, body.pinned ? 1 : 0, body.show_on_overview ? 1 : 0, body.show_on_today ? 1 : 0, order, actor.type === 'member' ? actor.id : null).lastInsertRowid,
  );
  setNoteMembers(id, body.member_ids);
  logChange(actor, 'updated', 'project', projectId, `Added ${noteLabel(body)} to "${project.name}"`);
  return getProjectNote(id, EVERYONE)!;
}

export function updateProjectNote(id: number, input: unknown, actor: Actor): ProjectNote {
  const current = getProjectNote(id, actor);
  if (!current) throw notFound('Note not found');
  assertKidMay(actor, 'projects', current.created_by);
  const body = onlySupplied(input, parse(noteBody.partial(), input));
  const next = { ...current, ...body };
  db.prepare('UPDATE project_notes SET title = ?, body = ?, color = ?, pinned = ?, show_on_overview = ?, show_on_today = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    next.title, next.body, next.color, next.pinned ? 1 : 0, next.show_on_overview ? 1 : 0, next.show_on_today ? 1 : 0, next.sort_order, nowIso(), id,
  );
  if (body.member_ids) setNoteMembers(id, body.member_ids);
  const project = getProject(current.project_id);
  logChange(actor, 'updated', 'project', current.project_id, `Edited ${noteLabel(next)} in "${project?.name ?? 'a project'}"`);
  return getProjectNote(id, EVERYONE)!;
}

export function deleteProjectNote(id: number, actor: Actor) {
  const current = getProjectNote(id, actor);
  if (!current) throw notFound('Note not found');
  assertKidMay(actor, 'projects', current.created_by);
  db.prepare('DELETE FROM project_notes WHERE id = ?').run(id);
  logChange(actor, 'updated', 'project', current.project_id, `Deleted ${noteLabel(current)}`);
}

/** Older clients and agents send one `notes` text per project: it lands in the project's first shared note. */
function setLegacyNotes(projectId: number, text: string, actor: Actor) {
  const first = db
    .prepare('SELECT n.id FROM project_notes n WHERE n.project_id = ? AND NOT EXISTS (SELECT 1 FROM project_note_members nm WHERE nm.note_id = n.id) ORDER BY n.sort_order, n.id LIMIT 1')
    .get(projectId) as { id: number } | undefined;
  if (first) db.prepare('UPDATE project_notes SET body = ?, updated_at = ? WHERE id = ?').run(text, nowIso(), first.id);
  else if (text.trim()) db.prepare('INSERT INTO project_notes (project_id, title, body, created_by) VALUES (?, ?, ?, ?)').run(projectId, 'Notes', text, actor.type === 'member' ? actor.id : null);
}

/** Restoring an older backup brings back the single notes field; turn it into a note. */
export function adoptLegacyNotes() {
  db.prepare(
    `INSERT INTO project_notes (project_id, title, body, created_by, created_at, updated_at)
     SELECT id, 'Notes', notes, created_by, created_at, updated_at FROM projects WHERE trim(notes) <> ''`,
  ).run();
  db.prepare("UPDATE projects SET notes = '' WHERE trim(notes) <> ''").run();
}

export function getProjectDetail(id: number, viewer: Actor): ProjectDetail | undefined {
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
    project_notes: listProjectNotes(id, viewer),
  };
}

projects.get('/projects', handler((req) => queryProjects(parse(listQuery, req.query))));

projects.get(
  '/projects/:id',
  handler((req) => {
    const p = getProjectDetail(idParam(req), actorFrom(req));
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
         VALUES (@name, @description, @status, @priority, @color, @icon, @owner, @start_date, @target_date, @budget, '', @order, @created_by, @completed_at)`,
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
  if (body.notes.trim()) setLegacyNotes(id, body.notes, actor);
  logChange(actor, 'created', 'project', id, `Started project "${body.name}"`);
  return getProjectDetail(id, actor)!;
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
  assertMayChangeProject(actor, id);
  const body = onlySupplied(input, parse(projectBody.partial().extend({ archived: z.boolean().optional() }), input));
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
    notes: '',
    archived: next.archived ? 1 : 0,
    completed_at,
    now: nowIso(),
  });
  if (body.member_ids) setProjectMembers(id, body.member_ids);
  if (body.name) db.prepare('UPDATE shopping_lists SET name = ? WHERE project_id = ?').run(body.name, id);
  if (body.notes !== undefined) setLegacyNotes(id, body.notes, actor);
  const what = body.status && body.status !== current.status ? `Moved "${next.name}" to ${next.status.replace('_', ' ')}` : `Updated project "${next.name}"`;
  logChange(actor, 'updated', 'project', id, what);
  return getProjectDetail(id, actor)!;
}

projects.patch('/projects/:id', handler((req) => updateProject(idParam(req), req.body, actorFrom(req))));

export function deleteProject(id: number, actor: Actor) {
  const current = getProject(id);
  if (!current) throw notFound('Project not found');
  assertMayChangeProject(actor, id);
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
    assertKidMay(actorFrom(req), 'projects');
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
  assertMayChangeProject(actor, projectId);
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
  assertMayChangeProject(actor, current.project_id);
  const body = onlySupplied(input, parse(milestoneBody.partial().extend({ done: z.boolean().optional(), sort_order: z.number().int().optional() }), input));
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
  assertMayChangeProject(actor, current.project_id);
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
  assertMayChangeProject(actor, projectId);
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
  assertMayChangeProject(actor, current.project_id);
  const body = onlySupplied(input, parse(expenseBody.partial(), input));
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
  assertMayChangeProject(actor, current.project_id);
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
  url: z.string().trim().url().max(2000).refine((url) => /^https?:\/\//i.test(url), 'Only http(s) links are allowed'),
});

const getLink = (id: number) => db.prepare('SELECT * FROM project_links WHERE id = ?').get(id) as ProjectLink | undefined;

projects.post(
  '/projects/:id/links',
  handler((req, res) => {
    const projectId = idParam(req);
    if (!getProject(projectId)) throw notFound('Project not found');
    assertMayChangeProject(actorFrom(req), projectId);
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
    assertMayChangeProject(actorFrom(req), current.project_id);
    const body = onlySupplied(req.body, parse(linkBody.partial(), req.body));
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
    assertMayChangeProject(actorFrom(req), current.project_id);
    db.prepare('DELETE FROM project_links WHERE id = ?').run(id);
    logChange(actorFrom(req), 'updated', 'project', current.project_id, `Removed link "${current.label}"`);
    res.status(204);
  }),
);

projects.get('/notes/today', handler((req) => todayNotes(actorFrom(req))));

projects.post(
  '/projects/:id/notes',
  handler((req, res) => {
    res.status(201);
    return createProjectNote(idParam(req), req.body, actorFrom(req));
  }),
);

projects.patch('/notes/:id', handler((req) => updateProjectNote(idParam(req), req.body, actorFrom(req))));

projects.delete(
  '/notes/:id',
  handler((req, res) => {
    deleteProjectNote(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

export { projectBody, milestoneBody, expenseBody, noteBody, listQuery as projectListQuery };
