/**
 * Model Context Protocol server, so agents (Hermes, Claude, anything MCP-aware)
 * can use Lar as a tool. Mounted at /mcp on the same Express app,
 * stateless Streamable HTTP: every request gets a fresh server + transport.
 */
import type { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { db } from './db.js';
import type { Actor } from './context.js';
import { HttpError } from './http.js';
import { listMembers, listGroups, todayIso } from './repo.js';
import { loadHousehold } from './routes/household.js';
import { queryTasks, createTask, updateTask, setDone, deleteTask } from './routes/tasks.js';
import { listShoppingLists, queryShoppingItems, createShoppingItem, updateShoppingItem, setChecked, deleteShoppingItem, clearChecked } from './routes/shopping.js';
import { queryProjects, getProjectDetail, createProject, updateProject, createMilestone, updateMilestone, createExpense } from './routes/projects.js';
import { summary } from './routes/misc.js';
import { listRecipes, createRecipe, updateRecipe, deleteRecipe, listMenu, upsertMenuEntry, deleteMenuEntry, createMenuRule, listMenuRules } from './routes/recipes.js';
import { parseShoppingText, parseTaskText } from '../shared/parse.js';
import type { Assignees, Task, ShoppingItem, Project } from '../shared/types.js';

// ---------- helpers ----------

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true });

function run<T>(fn: () => T) {
  try {
    return text(fn());
  } catch (e) {
    return fail(e instanceof HttpError ? e.message : (e as Error).message);
  }
}

/** Resolve a person, group, or "everyone" into assignee ids. Unknown names throw. */
function resolveAssignees(names: string[] | undefined): Assignees {
  const out: Assignees = { member_ids: [], group_ids: [] };
  if (!names || !names.length) return out;
  const members = listMembers();
  const groups = listGroups();
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    if (!n || n === 'everyone' || n === 'all' || n === 'household') continue;
    const m = members.find((x) => x.name.toLowerCase() === n || x.name.toLowerCase().startsWith(n));
    if (m) {
      out.member_ids.push(m.id);
      continue;
    }
    const g = groups.find((x) => x.name.toLowerCase() === n || x.name.toLowerCase().startsWith(n));
    if (g) {
      out.group_ids.push(g.id);
      continue;
    }
    throw new HttpError(400, `Nobody called "${raw}" in this household. People: ${members.map((x) => x.name).join(', ') || 'none'}. Groups: ${groups.map((x) => x.name).join(', ') || 'none'}.`);
  }
  return out;
}

function resolveMember(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const m = listMembers().find((x) => x.name.toLowerCase() === n || x.name.toLowerCase().startsWith(n));
  if (!m) throw new HttpError(400, `Nobody called "${name}" in this household.`);
  return m.id;
}

function resolveProject(ref: string | number | undefined): Project | undefined {
  if (ref === undefined || ref === null || ref === '') return undefined;
  const all = queryProjects({ status: 'all', archived: false });
  if (typeof ref === 'number') {
    const p = all.find((x) => x.id === ref);
    if (!p) throw new HttpError(404, `No project with id ${ref}.`);
    return p;
  }
  const n = ref.trim().toLowerCase();
  const p = all.find((x) => x.name.toLowerCase() === n) ?? all.find((x) => x.name.toLowerCase().includes(n));
  if (!p) throw new HttpError(404, `No project called "${ref}". Projects: ${all.map((x) => x.name).join(', ') || 'none'}.`);
  return p;
}

function resolveList(ref: string | number | undefined): number {
  if (ref === undefined || ref === null || ref === '') return 1;
  const lists = listShoppingLists();
  if (typeof ref === 'number') {
    if (!lists.some((l) => l.id === ref)) throw new HttpError(404, `No shopping list with id ${ref}.`);
    return ref;
  }
  const n = ref.trim().toLowerCase();
  const l = lists.find((x) => x.name.toLowerCase() === n) ?? lists.find((x) => x.name.toLowerCase().includes(n));
  if (!l) throw new HttpError(404, `No shopping list called "${ref}". Lists: ${lists.map((x) => x.name).join(', ')}.`);
  return l.id;
}

const memberNames = () => new Map(listMembers(true).map((m) => [m.id, m.name]));
const groupNames = () => new Map(listGroups().map((g) => [g.id, g.name]));

function describeAssignees(a: Assignees, ms = memberNames(), gs = groupNames()) {
  const names = [...a.group_ids.map((id) => gs.get(id)).filter(Boolean), ...a.member_ids.map((id) => ms.get(id)).filter(Boolean)];
  return names.length ? names.join(', ') : 'everyone';
}

function compactTask(t: Task, projects: Map<number, string>, ms = memberNames(), gs = groupNames()) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    due_date: t.due_date,
    due_time: t.due_time,
    priority: t.priority,
    for: describeAssignees(t.assignees, ms, gs),
    project: t.project_id ? projects.get(t.project_id) ?? null : null,
    repeats: t.recurrence ? `${t.recurrence.freq} x${t.recurrence.interval}` : null,
    notes: t.notes || undefined,
  };
}

function compactItem(i: ShoppingItem, ms = memberNames(), gs = groupNames()) {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit || undefined,
    category: i.category || undefined,
    priority: i.priority,
    checked: !!i.checked_at,
    for: describeAssignees(i.assignees, ms, gs),
    notes: i.notes || undefined,
    list_id: i.list_id,
  };
}

const projectNames = () => new Map(queryProjects({ status: 'all', archived: false }).map((p) => [p.id, p.name]));

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');
const zNames = z.array(z.string()).optional().describe('People or group names, e.g. ["Alex"] or ["Kids"]. Omit or empty = everyone.');
const addIsoDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
};

// ---------- server factory ----------

export function buildMcpServer(actor: Actor) {
  const server = new McpServer({ name: 'lar', version: '0.2.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'lar_overview',
    {
      title: 'Household overview',
      description: 'Who lives here (people and groups), today\'s date, and counts of open to-dos, shopping items, and active projects. Call this first.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => ({ today: todayIso(), household: loadHousehold(), summary: summary() })),
  );

  // ----- to-dos -----
  server.registerTool(
    'list_todos',
    {
      title: 'List to-dos',
      description: 'List household to-dos. Filter by status, who they are for, due window, project, or search text.',
      inputSchema: {
        status: z.enum(['open', 'done', 'all']).default('open'),
        for_person: z.string().optional().describe('Only to-dos this person can see (theirs, their groups, or everyone).'),
        due: z.enum(['today', 'overdue', 'week', 'none', 'scheduled']).optional(),
        project: z.string().optional().describe('Project name, or "none" for household-only to-dos.'),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    ({ status, for_person, due, project, search, limit }) =>
      run(() => {
        const proj = project && project !== 'none' ? resolveProject(project) : undefined;
        const tasks = queryTasks({ status, member: resolveMember(for_person), due, project: project === 'none' ? 'none' : proj?.id, q: search, limit });
        const names = projectNames();
        return tasks.map((t) => compactTask(t, names));
      }),
  );

  server.registerTool(
    'add_todo',
    {
      title: 'Add a to-do',
      description: 'Create a to-do. Natural phrasing in the title is understood ("tomorrow", "friday", "!high"), or set fields explicitly.',
      inputSchema: {
        title: z.string().min(1),
        due_date: zDate.optional(),
        due_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        for: zNames,
        project: z.string().optional().describe('Project name to file this under.'),
        notes: z.string().optional(),
        repeat: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
        repeat_every: z.number().int().min(1).optional().describe('Interval for repeat, default 1.'),
        repeat_weekdays: z.array(z.number().int().min(0).max(6)).optional().describe('For weekly: 0=Sunday..6=Saturday.'),
      },
    },
    (a) =>
      run(() => {
        const parsed = parseTaskText(a.title);
        const t = createTask(
          {
            title: parsed.title || a.title,
            due_date: a.due_date ?? parsed.due_date ?? null,
            due_time: a.due_time ?? null,
            priority: a.priority ?? parsed.priority ?? 'normal',
            notes: a.notes ?? '',
            assignees: resolveAssignees(a.for),
            project_id: resolveProject(a.project)?.id ?? null,
            recurrence: a.repeat ? { freq: a.repeat, interval: a.repeat_every ?? 1, weekdays: a.repeat_weekdays } : null,
          },
          actor,
        );
        return compactTask(t, projectNames());
      }),
  );

  server.registerTool(
    'update_todo',
    {
      title: 'Update a to-do',
      description: 'Change any field of a to-do by id. Only provided fields change. Use for=[] to make it for everyone.',
      inputSchema: {
        id: z.number().int(),
        title: z.string().optional(),
        due_date: zDate.nullable().optional(),
        due_time: z.string().nullable().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        for: zNames,
        project: z.string().nullable().optional(),
        notes: z.string().optional(),
      },
    },
    ({ id, for: names, project, ...rest }) =>
      run(() => {
        const patch: Record<string, unknown> = { ...rest };
        if (names !== undefined) patch.assignees = resolveAssignees(names);
        if (project !== undefined) patch.project_id = project === null ? null : resolveProject(project)?.id ?? null;
        return compactTask(updateTask(id, patch, actor), projectNames());
      }),
  );

  server.registerTool('complete_todo', { title: 'Complete a to-do', description: 'Mark a to-do as done by id. Repeating to-dos schedule their next occurrence.', inputSchema: { id: z.number().int() } }, ({ id }) =>
    run(() => compactTask(setDone(id, true, actor), projectNames())),
  );
  server.registerTool('reopen_todo', { title: 'Reopen a to-do', description: 'Mark a done to-do as open again.', inputSchema: { id: z.number().int() } }, ({ id }) => run(() => compactTask(setDone(id, false, actor), projectNames())));
  server.registerTool('delete_todo', { title: 'Delete a to-do', description: 'Permanently delete a to-do by id.', inputSchema: { id: z.number().int() }, annotations: { destructiveHint: true } }, ({ id }) =>
    run(() => {
      deleteTask(id, actor);
      return { deleted: id };
    }),
  );

  // ----- shopping -----
  server.registerTool(
    'list_shopping',
    {
      title: 'List shopping items',
      description: 'Items on a shopping list. Default list is "Household"; projects have their own lists. Lists available via lar_overview or list "all".',
      inputSchema: {
        list: z.string().optional().describe('List name or "all" to see every list with counts.'),
        status: z.enum(['open', 'checked', 'all']).default('open'),
        for_person: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ list, status, for_person }) =>
      run(() => {
        if (list === 'all') return listShoppingLists();
        const items = queryShoppingItems({ list: resolveList(list), status, member: resolveMember(for_person) });
        const ms = memberNames();
        const gs = groupNames();
        return items.map((i) => compactItem(i, ms, gs));
      }),
  );

  server.registerTool(
    'add_shopping_items',
    {
      title: 'Add shopping items',
      description: 'Add one or more items. Each entry can be free text like "2x oat milk" or "1 kg apples". Adding an item already on the list bumps its quantity.',
      inputSchema: {
        items: z.array(z.string().min(1)).min(1),
        list: z.string().optional().describe('List or project name. Default: Household.'),
        category: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().describe('Applies to all items unless the item text contains !low, !high, or !urgent.'),
        for: zNames,
        notes: z.string().optional(),
      },
    },
    ({ items, list, category, priority, for: names, notes }) =>
      run(() => {
        const listId = resolveList(list) ;
        const assignees = resolveAssignees(names);
        return items.map((raw) => {
          const parsed = parseShoppingText(raw);
          return compactItem(createShoppingItem({ list_id: listId, ...parsed, priority: parsed.priority ?? priority ?? 'normal', category: category ?? '', notes: notes ?? '', assignees }, actor));
        });
      }),
  );

  server.registerTool(
    'update_shopping_item',
    {
      title: 'Update a shopping item',
      description: 'Change quantity, name, priority, category, notes, or who it is for.',
      inputSchema: { id: z.number().int(), name: z.string().optional(), quantity: z.number().nullable().optional(), unit: z.string().optional(), category: z.string().optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), notes: z.string().optional(), for: zNames },
    },
    ({ id, for: names, ...rest }) =>
      run(() => {
        const patch: Record<string, unknown> = { ...rest };
        if (names !== undefined) patch.assignees = resolveAssignees(names);
        return compactItem(updateShoppingItem(id, patch, actor));
      }),
  );

  server.registerTool(
    'check_shopping_items',
    {
      title: 'Check or uncheck shopping items',
      description: 'Mark items as picked up (checked=true) or put them back (checked=false). Accepts ids or exact names.',
      inputSchema: { ids: z.array(z.number().int()).optional(), names: z.array(z.string()).optional(), checked: z.boolean().default(true), list: z.string().optional() },
    },
    ({ ids, names, checked, list }) =>
      run(() => {
        const targets = new Set(ids ?? []);
        if (names?.length) {
          const items = queryShoppingItems({ list: resolveList(list), status: 'all' });
          for (const n of names) {
            const hit = items.find((i) => i.name.toLowerCase() === n.toLowerCase()) ?? items.find((i) => i.name.toLowerCase().includes(n.toLowerCase()));
            if (!hit) throw new HttpError(404, `"${n}" is not on the list.`);
            targets.add(hit.id);
          }
        }
        return [...targets].map((id) => compactItem(setChecked(id, checked, actor)));
      }),
  );

  server.registerTool('remove_shopping_items', { title: 'Remove shopping items', description: 'Delete items from a list by id.', inputSchema: { ids: z.array(z.number().int()).min(1) }, annotations: { destructiveHint: true } }, ({ ids }) =>
    run(() => {
      ids.forEach((id) => deleteShoppingItem(id, actor));
      return { deleted: ids };
    }),
  );
  server.registerTool('clear_checked_shopping', { title: 'Clear picked-up items', description: 'Remove all checked items from a list (default Household).', inputSchema: { list: z.string().optional() } }, ({ list }) =>
    run(() => clearChecked(resolveList(list), actor)),
  );

  // ----- projects -----
  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'Home projects with status, progress, budget, and next milestone.',
      inputSchema: { status: z.enum(['open', 'active', 'planned', 'idea', 'on_hold', 'done', 'all']).default('open'), for_person: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ status, for_person }) =>
      run(() =>
        queryProjects({ status, archived: false, member: resolveMember(for_person) }).map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          description: p.description || undefined,
          target_date: p.target_date,
          progress: `${p.task_done_count}/${p.task_count} to-dos, ${p.milestone_done_count}/${p.milestone_count} milestones`,
          budget: p.budget,
          spent: p.spent,
          next_milestone: p.next_milestone,
        })),
      ),
  );

  server.registerTool(
    'get_project',
    { title: 'Get a project', description: 'Everything about one project: milestones, to-dos, shopping list, expenses, notes, links.', inputSchema: { project: z.string().describe('Project name or id') }, annotations: { readOnlyHint: true } },
    ({ project }) =>
      run(() => {
        const ref = /^\d+$/.test(project) ? Number(project) : project;
        const d = getProjectDetail(resolveProject(ref)!.id)!;
        const ms = memberNames();
        const gs = groupNames();
        return {
          ...d,
          tasks: d.tasks.map((t) => compactTask(t, new Map([[d.id, d.name]]), ms, gs)),
          shopping_items: d.shopping_items.map((i) => compactItem(i, ms, gs)),
        };
      }),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description: 'Start a new home project.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(['idea', 'planned', 'active', 'on_hold', 'done']).optional(),
        priority: z.enum(['low', 'normal', 'high']).optional(),
        owner: z.string().optional().describe('Person name'),
        members: z.array(z.string()).optional(),
        start_date: zDate.optional(),
        target_date: zDate.optional(),
        budget: z.number().optional(),
      },
    },
    (a) =>
      run(() => {
        const owner = resolveMember(a.owner);
        const memberIds = a.members?.map((m) => resolveMember(m)!).filter(Boolean);
        const p = createProject({ name: a.name, description: a.description ?? '', status: a.status ?? 'planned', priority: a.priority ?? 'normal', owner_id: owner ?? null, member_ids: memberIds, start_date: a.start_date ?? null, target_date: a.target_date ?? null, budget: a.budget ?? null }, actor);
        return { id: p.id, name: p.name, status: p.status };
      }),
  );

  server.registerTool(
    'update_project',
    {
      title: 'Update a project',
      description: 'Change status, dates, budget, description, or notes of a project.',
      inputSchema: {
        project: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['idea', 'planned', 'active', 'on_hold', 'done']).optional(),
        priority: z.enum(['low', 'normal', 'high']).optional(),
        start_date: zDate.nullable().optional(),
        target_date: zDate.nullable().optional(),
        budget: z.number().nullable().optional(),
        notes: z.string().optional().describe('Replaces the project notes.'),
        append_notes: z.string().optional().describe('Adds a paragraph to the end of the notes.'),
      },
    },
    ({ project, append_notes, ...rest }) =>
      run(() => {
        const p = resolveProject(/^\d+$/.test(project) ? Number(project) : project)!;
        const patch: Record<string, unknown> = { ...rest };
        if (append_notes) {
          const cur = (db.prepare('SELECT notes FROM projects WHERE id = ?').get(p.id) as { notes: string }).notes;
          patch.notes = cur ? `${cur}\n\n${append_notes}` : append_notes;
        }
        const d = updateProject(p.id, patch, actor);
        return { id: d.id, name: d.name, status: d.status, target_date: d.target_date, budget: d.budget, spent: d.spent };
      }),
  );

  server.registerTool('add_milestone', { title: 'Add a milestone', description: 'Add a milestone to a project.', inputSchema: { project: z.string(), title: z.string().min(1), due_date: zDate.optional(), description: z.string().optional() } }, ({ project, ...m }) =>
    run(() => createMilestone(resolveProject(/^\d+$/.test(project) ? Number(project) : project)!.id, { title: m.title, due_date: m.due_date ?? null, description: m.description ?? '' }, actor)),
  );
  server.registerTool('complete_milestone', { title: 'Complete a milestone', description: 'Mark a milestone reached (or reopen with done=false).', inputSchema: { id: z.number().int(), done: z.boolean().default(true) } }, ({ id, done }) =>
    run(() => updateMilestone(id, { done }, actor)),
  );
  server.registerTool(
    'add_expense',
    { title: 'Log an expense', description: 'Record money spent on a project.', inputSchema: { project: z.string(), title: z.string().min(1), amount: z.number().min(0), date: zDate.optional(), category: z.string().optional(), notes: z.string().optional() } },
    ({ project, ...e }) => run(() => createExpense(resolveProject(/^\d+$/.test(project) ? Number(project) : project)!.id, { title: e.title, amount: e.amount, date: e.date, category: e.category ?? '', notes: e.notes ?? '' }, actor)),
  );

  server.registerTool(
    'recent_activity',
    { title: 'Recent activity', description: 'What changed recently and who did it.', inputSchema: { limit: z.number().int().min(1).max(100).default(20) }, annotations: { readOnlyHint: true } },
    ({ limit }) => run(() => db.prepare('SELECT actor_name, summary, created_at FROM activity ORDER BY id DESC LIMIT ?').all(limit)),
  );

  // ----- recipes & weekly menu -----
  server.registerTool(
    'list_recipes',
    { title: 'List recipes', description: 'Search the household recipe book.', inputSchema: { search: z.string().optional() }, annotations: { readOnlyHint: true } },
    ({ search }) => run(() => listRecipes(search).map((r) => ({ id: r.id, name: r.name, description: r.description || undefined, prep_minutes: r.prep_minutes, servings: r.servings, source: r.source || undefined, tags: r.tags || undefined, ingredients: r.ingredient_rows, instructions: r.instructions }))),
  );
  server.registerTool(
    'add_recipe',
    {
      title: 'Add a recipe',
      description: 'Save a recipe in the household recipe book.',
      inputSchema: { name: z.string().min(1), description: z.string().optional(), ingredients: z.string().optional(), ingredient_rows: z.array(z.object({ quantity: z.string().optional(), unit: z.string().optional(), ingredient: z.string().min(1) })).optional(), instructions: z.string().optional(), prep_minutes: z.number().int().min(1).optional(), servings: z.number().int().min(1).optional(), source: z.string().optional(), tags: z.string().optional() },
    },
    (input) => run(() => createRecipe(input, actor)),
  );
  server.registerTool(
    'update_recipe',
    {
      title: 'Update a recipe',
      description: 'Change a recipe by id.',
      inputSchema: { id: z.number().int(), name: z.string().optional(), description: z.string().optional(), ingredients: z.string().optional(), ingredient_rows: z.array(z.object({ quantity: z.string().optional(), unit: z.string().optional(), ingredient: z.string().min(1) })).optional(), instructions: z.string().optional(), prep_minutes: z.number().int().min(1).nullable().optional(), servings: z.number().int().min(1).nullable().optional(), source: z.string().optional(), tags: z.string().optional() },
    },
    ({ id, ...patch }) => run(() => updateRecipe(id, patch, actor)),
  );
  server.registerTool(
    'delete_recipe',
    { title: 'Delete a recipe', description: 'Permanently delete a recipe by id.', inputSchema: { id: z.number().int() }, annotations: { destructiveHint: true } },
    ({ id }) => run(() => { deleteRecipe(id, actor); return { deleted: id }; }),
  );
  server.registerTool(
    'schedule_recipe',
    { title: 'Schedule a recurring recipe', description: 'Repeat a recipe every few days or on named weekly days, such as Friday dinner.', inputSchema: { recipe_id: z.number().int().positive(), meal: z.enum(['breakfast', 'lunch', 'dinner']), start_date: zDate, frequency: z.enum(['daily', 'weekly']), interval: z.number().int().min(1).default(1), weekdays: z.array(z.number().int().min(0).max(6)).optional() } },
    ({ recipe_id, meal, start_date, frequency, interval, weekdays }) => run(() => createMenuRule({ recipe_id, meal_type: meal, start_date, recurrence: { freq: frequency, interval, weekdays } }, actor)),
  );
  server.registerTool(
    'list_recipe_schedules',
    { title: 'List recurring recipe schedules', description: 'Show all recurring meal rules, optionally for one recipe.', inputSchema: { recipe_id: z.number().int().positive().optional() }, annotations: { readOnlyHint: true } },
    ({ recipe_id }) => run(() => listMenuRules(recipe_id)),
  );
  server.registerTool(
    'get_weekly_menu',
    { title: 'Get weekly menu', description: 'Show planned meals in a date range. Defaults to today through the next seven days.', inputSchema: { from: zDate.optional(), to: zDate.optional() }, annotations: { readOnlyHint: true } },
    ({ from, to }) => run(() => { const start = from ?? todayIso(); return listMenu(start, to ?? addIsoDays(start, 6)); }),
  );
  server.registerTool(
    'plan_meal',
    {
      title: 'Plan a meal',
      description: 'Set breakfast, lunch, or dinner for a day using a recipe id or a custom meal name.',
      inputSchema: { date: zDate, meal: z.enum(['breakfast', 'lunch', 'dinner']), recipe_id: z.number().int().positive().nullable().optional(), title: z.string().optional(), notes: z.string().optional() },
    },
    ({ date, meal, recipe_id, title, notes }) => run(() => upsertMenuEntry({ meal_date: date, meal_type: meal, recipe_id: recipe_id ?? null, custom_title: title ?? '', notes: notes ?? '' }, actor)),
  );
  server.registerTool(
    'clear_planned_meal',
    { title: 'Clear planned meal', description: 'Remove a weekly menu entry by id.', inputSchema: { id: z.number().int() }, annotations: { destructiveHint: true } },
    ({ id }) => run(() => { deleteMenuEntry(id, actor); return { deleted: id }; }),
  );

  return server;
}

const INSTRUCTIONS = `Lar is a family's household hub: shared to-dos, shopping lists, home projects, recipes, and a weekly menu.
Start with lar_overview to learn the people and groups. Refer to people and projects by name.
"For" on a to-do or shopping item is who it applies to; empty means everyone in the household.
Dates are YYYY-MM-DD in the household's local timezone.`;

// ---------- express mount ----------

export function mountMcp(app: Express) {
  const handle = async (req: Request, res: Response) => {
    const agent = req.header('x-lar-agent') || 'agent';
    const actor: Actor = { type: 'agent', id: null, name: agent.slice(0, 60) };
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = buildMcpServer(actor);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp]', err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  };
  app.post('/mcp', handle);
  app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Lar MCP is stateless: send JSON-RPC over POST.' }));
  app.delete('/mcp', (_req, res) => res.status(405).end());
}
