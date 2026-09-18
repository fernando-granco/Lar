import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { handler, parse, idParam, notFound, badRequest, zDate, zTime, zAssignees, zIdList } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { loadTasks, getTask, setAssignees, assignedToMemberSql, nextDueDate, todayIso } from '../repo.js';
import type { Task } from '../../shared/types.js';

export const tasks = Router();

const zRecurrence = z
  .object({
    freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(365).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  })
  .nullable();

const taskBody = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000).default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  due_date: zDate.nullable().default(null),
  due_time: zTime.nullable().default(null),
  recurrence: zRecurrence.default(null),
  project_id: z.number().int().positive().nullable().default(null),
  milestone_id: z.number().int().positive().nullable().default(null),
  assignees: zAssignees,
});

const listQuery = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  project: z.union([z.literal('none'), z.literal('any'), z.coerce.number().int().positive()]).optional(),
  member: z.coerce.number().int().positive().optional(),
  milestone: z.coerce.number().int().positive().optional(),
  due: z.enum(['today', 'overdue', 'week', 'none', 'scheduled']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Build the WHERE clause shared by the REST API and the agent tools. */
export function taskFilter(q: z.infer<typeof listQuery>) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (q.status !== 'all') (where.push('t.status = @status'), (params.status = q.status));
  if (q.project === 'none') where.push('t.project_id IS NULL');
  else if (typeof q.project === 'number') (where.push('t.project_id = @project'), (params.project = q.project));
  if (q.milestone) (where.push('t.milestone_id = @milestone'), (params.milestone = q.milestone));
  if (q.member) (where.push(assignedToMemberSql('task', 't')), (params.member = q.member));
  const today = todayIso();
  if (q.due === 'today') (where.push('t.due_date = @today'), (params.today = today));
  if (q.due === 'overdue') (where.push("t.due_date < @today AND t.status = 'open'"), (params.today = today));
  if (q.due === 'week') {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    where.push('t.due_date >= @today AND t.due_date <= @weekEnd');
    params.today = today;
    params.weekEnd = end.toISOString().slice(0, 10);
  }
  if (q.due === 'none') where.push('t.due_date IS NULL');
  if (q.due === 'scheduled') where.push('t.due_date IS NOT NULL');
  if (q.q) (where.push('(t.title LIKE @q OR t.notes LIKE @q)'), (params.q = `%${q.q}%`));
  return { where: where.length ? where.join(' AND ') : '1=1', params, limit: q.limit };
}

export function queryTasks(q: z.infer<typeof listQuery>): Task[] {
  const f = taskFilter(q);
  const rows = loadTasks(f.where, f.params);
  return f.limit ? rows.slice(0, f.limit) : rows;
}

tasks.get('/tasks', handler((req) => queryTasks(parse(listQuery, req.query))));

tasks.get(
  '/tasks/:id',
  handler((req) => {
    const t = getTask(idParam(req));
    if (!t) throw notFound('Task not found');
    return t;
  }),
);

export function createTask(input: z.input<typeof taskBody>, actor: ReturnType<typeof actorFrom>): Task {
  const body = parse(taskBody, input);
  if (body.project_id && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(body.project_id)) throw badRequest('Project does not exist');
  if (body.milestone_id) {
    const ms = db.prepare('SELECT project_id FROM milestones WHERE id = ?').get(body.milestone_id) as any;
    if (!ms) throw badRequest('Milestone does not exist');
    if (body.project_id && ms.project_id !== body.project_id) throw badRequest('Milestone belongs to a different project');
    body.project_id = ms.project_id;
  }
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM tasks').get() as any).n;
  const id = Number(
    db
      .prepare(
        `INSERT INTO tasks (title, notes, priority, due_date, due_time, recurrence, project_id, milestone_id, sort_order, created_by)
         VALUES (@title, @notes, @priority, @due_date, @due_time, @recurrence, @project_id, @milestone_id, @order, @created_by)`,
      )
      .run({
        ...body,
        recurrence: body.recurrence ? JSON.stringify(body.recurrence) : null,
        order,
        created_by: actor.type === 'member' ? actor.id : null,
      }).lastInsertRowid,
  );
  setAssignees('task', id, body.assignees);
  const task = getTask(id)!;
  logChange(actor, 'created', 'task', id, `Added to-do "${task.title}"`);
  return task;
}

tasks.post(
  '/tasks',
  handler((req, res) => {
    res.status(201);
    return createTask(req.body, actorFrom(req));
  }),
);

export function updateTask(id: number, input: unknown, actor: ReturnType<typeof actorFrom>): Task {
  const current = getTask(id);
  if (!current) throw notFound('Task not found');
  const body = parse(taskBody.partial().extend({ status: z.enum(['open', 'done']).optional() }), input);
  const next = { ...current, ...body, assignees: body.assignees ?? current.assignees };
  if (body.status && body.status !== current.status) return setDone(id, body.status === 'done', actor);
  db.prepare(
    `UPDATE tasks SET title=@title, notes=@notes, priority=@priority, due_date=@due_date, due_time=@due_time, recurrence=@recurrence,
       project_id=@project_id, milestone_id=@milestone_id, updated_at=@now WHERE id=@id`,
  ).run({
    id,
    title: next.title,
    notes: next.notes,
    priority: next.priority,
    due_date: next.due_date,
    due_time: next.due_time,
    recurrence: next.recurrence ? JSON.stringify(next.recurrence) : null,
    project_id: next.project_id,
    milestone_id: next.milestone_id,
    now: nowIso(),
  });
  if (body.assignees) setAssignees('task', id, body.assignees);
  const task = getTask(id)!;
  logChange(actor, 'updated', 'task', id, `Updated to-do "${task.title}"`);
  return task;
}

tasks.patch('/tasks/:id', handler((req) => updateTask(idParam(req), req.body, actorFrom(req))));

/** Complete or reopen. Completing a recurring task spawns the next occurrence. */
export function setDone(id: number, done: boolean, actor: ReturnType<typeof actorFrom>): Task {
  const current = getTask(id);
  if (!current) throw notFound('Task not found');
  const now = nowIso();
  db.prepare('UPDATE tasks SET status = ?, completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?').run(
    done ? 'done' : 'open',
    done ? now : null,
    done && actor.type === 'member' ? actor.id : null,
    now,
    id,
  );
  if (done && current.recurrence) {
    const base = current.due_date ?? todayIso();
    const dueNext = nextDueDate(base, current.recurrence);
    const nextId = Number(
      db
        .prepare(
          `INSERT INTO tasks (title, notes, priority, due_date, due_time, recurrence, project_id, milestone_id, sort_order, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(current.title, current.notes, current.priority, dueNext, current.due_time, JSON.stringify(current.recurrence), current.project_id, current.milestone_id, current.sort_order, current.created_by)
        .lastInsertRowid,
    );
    setAssignees('task', nextId, current.assignees);
    // The completed copy stops recurring so history stays clean.
    db.prepare('UPDATE tasks SET recurrence = NULL WHERE id = ?').run(id);
    logChange(actor, 'created', 'task', nextId, `Scheduled next "${current.title}" for ${dueNext}`);
  }
  const task = getTask(id)!;
  logChange(actor, 'updated', 'task', id, done ? `Completed "${task.title}"` : `Reopened "${task.title}"`);
  return task;
}

tasks.post('/tasks/:id/complete', handler((req) => setDone(idParam(req), true, actorFrom(req))));
tasks.post('/tasks/:id/reopen', handler((req) => setDone(idParam(req), false, actorFrom(req))));

export function deleteTask(id: number, actor: ReturnType<typeof actorFrom>) {
  const current = getTask(id);
  if (!current) throw notFound('Task not found');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  db.prepare("DELETE FROM assignments WHERE entity_type = 'task' AND entity_id = ?").run(id);
  logChange(actor, 'deleted', 'task', id, `Deleted to-do "${current.title}"`);
}

tasks.delete(
  '/tasks/:id',
  handler((req, res) => {
    deleteTask(idParam(req), actorFrom(req));
    res.status(204);
  }),
);

tasks.post(
  '/tasks/reorder',
  handler((req) => {
    const { ids } = parse(z.object({ ids: zIdList }), req.body);
    const upd = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
    logChange(actorFrom(req), 'reordered', 'task', null, 'Reordered to-dos');
    return { ok: true };
  }),
);

tasks.post(
  '/tasks/clear-completed',
  handler((req) => {
    const q = parse(z.object({ project: z.coerce.number().int().positive().optional() }), req.body ?? {});
    const info = q.project
      ? db.prepare("DELETE FROM tasks WHERE status = 'done' AND project_id = ?").run(q.project)
      : db.prepare("DELETE FROM tasks WHERE status = 'done' AND project_id IS NULL").run();
    touchOrphans();
    logChange(actorFrom(req), 'deleted', 'task', null, `Cleared ${info.changes} completed to-dos`);
    return { deleted: info.changes };
  }),
);

function touchOrphans() {
  db.prepare("DELETE FROM assignments WHERE entity_type = 'task' AND entity_id NOT IN (SELECT id FROM tasks)").run();
}

export { taskBody, listQuery as taskListQuery };
