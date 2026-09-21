import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { actorFrom, logChange, type Actor } from '../context.js';
import { badRequest, handler, idParam, notFound, parse, onlySupplied, zDate } from '../http.js';
import type { MenuEntry, MenuRule, Recipe, RecipeIngredient } from '../../shared/types.js';

export const recipes = Router();

const recipeBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  ingredients: z.string().max(20_000).default(''),
  instructions: z.string().max(30_000).default(''),
  prep_minutes: z.number().int().min(1).max(24 * 60).nullable().default(null),
  servings: z.number().int().min(1).max(100).nullable().default(null),
  source: z.string().trim().max(1000).default(''),
  image_url: z.string().trim().max(1_500_000).refine((value) => !value || /^https:\/\//i.test(value) || /^data:image\/(png|jpeg|webp);base64,/i.test(value), 'Use an HTTPS image URL or a PNG, JPEG, or WebP image.').default(''),
  ingredient_rows: z.array(z.object({ quantity: z.string().trim().max(40).default(''), unit: z.string().trim().max(40).default(''), ingredient: z.string().trim().min(1).max(300) })).max(200).default([]),
  tags: z.string().trim().max(300).default(''),
});

const recurrenceBody = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).superRefine((value, ctx) => {
  if (value.freq === 'weekly' && !value.weekdays?.length) ctx.addIssue({ code: 'custom', message: 'Choose at least one weekday.' });
});
const ruleBody = z.object({ recipe_id: z.number().int().positive(), meal_type: z.enum(['breakfast', 'lunch', 'dinner']), start_date: zDate, recurrence: recurrenceBody });

const menuBody = z
  .object({
    meal_date: zDate,
    meal_type: z.enum(['breakfast', 'lunch', 'dinner']),
    recipe_id: z.number().int().positive().nullable().default(null),
    custom_title: z.string().trim().max(120).default(''),
    notes: z.string().max(1000).default(''),
  })
  .refine((v) => v.recipe_id || v.custom_title, { message: 'Choose a recipe or enter a meal name' });

function ensureRecipesEnabled() {
  // Recipes are always available. Each device decides whether the menu card appears on Today.
}

export function listRecipes(search?: string): Recipe[] {
  ensureRecipesEnabled();
  return (db
    .prepare(`SELECT * FROM recipes ${search ? 'WHERE name LIKE @q OR description LIKE @q OR tags LIKE @q' : ''} ORDER BY name COLLATE NOCASE, id`)
    .all(search ? { q: `%${search}%` } : {}) as Recipe[]).map(normalizeRecipe);
}

export function getRecipe(id: number): Recipe | undefined {
  ensureRecipesEnabled();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Recipe | undefined;
  return recipe ? normalizeRecipe(recipe) : undefined;
}

function normalizeRecipe(recipe: Recipe): Recipe {
  let ingredient_rows: RecipeIngredient[] = [];
  try { ingredient_rows = JSON.parse(recipe.ingredient_rows as unknown as string) as RecipeIngredient[]; } catch { /* legacy recipe */ }
  if (!ingredient_rows.length && recipe.ingredients) ingredient_rows = recipe.ingredients.split('\n').filter(Boolean).map((ingredient) => ({ quantity: '', unit: '', ingredient }));
  return { ...recipe, ingredient_rows };
}

export function createRecipe(input: unknown, actor: Actor): Recipe {
  ensureRecipesEnabled();
  const body = parse(recipeBody, input);
  const id = Number(
    db
      .prepare(`INSERT INTO recipes (name, description, ingredients, instructions, prep_minutes, servings, source, image_url, ingredient_rows, tags, created_by)
                VALUES (@name, @description, @ingredients, @instructions, @prep_minutes, @servings, @source, @image_url, @ingredient_rows, @tags, @created_by)`)
      .run({ ...body, source: body.source || (actor.type === 'agent' ? `Added by ${actor.name}` : ''), ingredients: body.ingredients || body.ingredient_rows.map((row) => [row.quantity, row.unit, row.ingredient].filter(Boolean).join(' ')).join('\n'), ingredient_rows: JSON.stringify(body.ingredient_rows), created_by: actor.type === 'member' ? actor.id : null }).lastInsertRowid,
  );
  const recipe = getRecipe(id)!;
  logChange(actor, 'created', 'recipe', id, `Added recipe "${recipe.name}"`);
  return recipe;
}

export function updateRecipe(id: number, input: unknown, actor: Actor): Recipe {
  const current = getRecipe(id);
  if (!current) throw notFound('Recipe not found');
  const body = onlySupplied(input, parse(recipeBody.partial(), input));
  const next = { ...current, ...body };
  db.prepare(`UPDATE recipes SET name=@name, description=@description, ingredients=@ingredients, instructions=@instructions,
              prep_minutes=@prep_minutes, servings=@servings, source=@source, image_url=@image_url, ingredient_rows=@ingredient_rows, tags=@tags, updated_at=@updated_at WHERE id=@id`)
    .run({ ...next, ingredients: next.ingredients || next.ingredient_rows.map((row) => [row.quantity, row.unit, row.ingredient].filter(Boolean).join(' ')).join('\n'), ingredient_rows: JSON.stringify(next.ingredient_rows), updated_at: nowIso() });
  const recipe = getRecipe(id)!;
  logChange(actor, 'updated', 'recipe', id, `Updated recipe "${recipe.name}"`);
  return recipe;
}

export function deleteRecipe(id: number, actor: Actor) {
  const current = getRecipe(id);
  if (!current) throw notFound('Recipe not found');
  // Menu rows require either a recipe or a custom title, so remove the slots
  // explicitly instead of letting ON DELETE SET NULL violate that invariant.
  db.transaction(() => {
    db.prepare('DELETE FROM weekly_menu WHERE recipe_id = ?').run(id);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  })();
  logChange(actor, 'deleted', 'recipe', id, `Deleted recipe "${current.name}"`);
}

export function listMenu(from: string, to: string): MenuEntry[] {
  ensureRecipesEnabled();
  const entries = db
    .prepare(`SELECT m.*, r.name AS recipe_name FROM weekly_menu m LEFT JOIN recipes r ON r.id = m.recipe_id
              WHERE m.meal_date >= ? AND m.meal_date <= ?
              ORDER BY m.meal_date, CASE m.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END`)
    .all(from, to) as MenuEntry[];
  const explicit = new Set(entries.map((entry) => `${entry.meal_date}:${entry.meal_type}`));
  const recipes = new Map(listRecipes().map((recipe) => [recipe.id, recipe]));
  for (const rule of listMenuRules()) {
    const recipe = recipes.get(rule.recipe_id);
    if (!recipe) continue;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const key = `${date}:${rule.meal_type}`;
      if (!explicit.has(key) && matchesRule(rule, date)) entries.push({ id: -(rule.id * 100000 + Number(date.replaceAll('-', ''))), meal_date: date, meal_type: rule.meal_type, recipe_id: recipe.id, recipe_name: recipe.name, custom_title: '', notes: '', created_by: rule.created_by, created_at: rule.created_at, updated_at: rule.created_at, rule_id: rule.id, from_rule: true });
    }
  }
  return entries.sort((a, b) => `${a.meal_date}:${a.meal_type}`.localeCompare(`${b.meal_date}:${b.meal_type}`));
}

const addDays = (date: string, amount: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); return d.toISOString().slice(0, 10); };
const dayDiff = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
function matchesRule(rule: MenuRule, date: string) {
  const days = dayDiff(rule.start_date, date);
  if (days < 0) return false;
  if (rule.recurrence.freq === 'daily') return days % rule.recurrence.interval === 0;
  if (rule.recurrence.freq === 'weekly') {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return Boolean(rule.recurrence.weekdays?.includes(weekday)) && Math.floor(days / 7) % rule.recurrence.interval === 0;
  }
  const start = new Date(`${rule.start_date}T12:00:00`); const current = new Date(`${date}T12:00:00`);
  if (rule.recurrence.freq === 'monthly') return current.getDate() === start.getDate() && (current.getFullYear() * 12 + current.getMonth() - start.getFullYear() * 12 - start.getMonth()) % rule.recurrence.interval === 0;
  return current.getMonth() === start.getMonth() && current.getDate() === start.getDate() && (current.getFullYear() - start.getFullYear()) % rule.recurrence.interval === 0;
}

export function listMenuRules(recipeId?: number): MenuRule[] {
  ensureRecipesEnabled();
  return (db.prepare(`SELECT * FROM menu_rules ${recipeId ? 'WHERE recipe_id = ?' : ''} ORDER BY id DESC`).all(...(recipeId ? [recipeId] : [])) as Array<Omit<MenuRule, 'recurrence'> & { recurrence: string }>).map((rule) => ({ ...rule, recurrence: JSON.parse(rule.recurrence) }));
}
export function createMenuRule(input: unknown, actor: Actor): MenuRule {
  ensureRecipesEnabled(); const body = parse(ruleBody, input);
  if (!getRecipe(body.recipe_id)) throw badRequest('Recipe does not exist');
  const id = Number(db.prepare('INSERT INTO menu_rules (recipe_id, meal_type, start_date, recurrence, created_by) VALUES (?, ?, ?, ?, ?)').run(body.recipe_id, body.meal_type, body.start_date, JSON.stringify(body.recurrence), actor.type === 'member' ? actor.id : null).lastInsertRowid);
  const rule = listMenuRules().find((item) => item.id === id)!;
  logChange(actor, 'created', 'menu', id, `Scheduled ${getRecipe(body.recipe_id)!.name}`); return rule;
}
export function deleteMenuRule(id: number, actor: Actor) { ensureRecipesEnabled(); const rule = db.prepare('SELECT recipe_id FROM menu_rules WHERE id = ?').get(id) as { recipe_id: number } | undefined; if (!rule) throw notFound('Menu rule not found'); db.prepare('DELETE FROM menu_rules WHERE id = ?').run(id); logChange(actor, 'deleted', 'menu', id, 'Removed recurring meal'); }

export function upsertMenuEntry(input: unknown, actor: Actor): MenuEntry {
  ensureRecipesEnabled();
  const body = parse(menuBody, input);
  if (body.recipe_id && !db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(body.recipe_id)) throw badRequest('Recipe does not exist');
  const now = nowIso();
  db.prepare(`INSERT INTO weekly_menu (meal_date, meal_type, recipe_id, custom_title, notes, created_by, updated_at)
              VALUES (@meal_date, @meal_type, @recipe_id, @custom_title, @notes, @created_by, @updated_at)
              ON CONFLICT(meal_date, meal_type) DO UPDATE SET
                recipe_id=excluded.recipe_id, custom_title=excluded.custom_title, notes=excluded.notes, updated_at=excluded.updated_at`)
    .run({ ...body, created_by: actor.type === 'member' ? actor.id : null, updated_at: now });
  const entry = db
    .prepare(`SELECT m.*, r.name AS recipe_name FROM weekly_menu m LEFT JOIN recipes r ON r.id=m.recipe_id
              WHERE m.meal_date=? AND m.meal_type=?`)
    .get(body.meal_date, body.meal_type) as MenuEntry;
  logChange(actor, 'updated', 'menu', entry.id, `Planned ${entry.recipe_name || entry.custom_title} for ${entry.meal_date}`);
  return entry;
}

export function deleteMenuEntry(id: number, actor: Actor) {
  ensureRecipesEnabled();
  const current = db.prepare('SELECT * FROM weekly_menu WHERE id = ?').get(id) as { id: number; meal_date: string; meal_type: string } | undefined;
  if (!current) throw notFound('Menu entry not found');
  db.prepare('DELETE FROM weekly_menu WHERE id = ?').run(id);
  logChange(actor, 'deleted', 'menu', id, `Cleared ${current.meal_type} on ${current.meal_date}`);
}

recipes.get('/recipes', handler((req) => listRecipes(parse(z.object({ q: z.string().trim().max(100).optional() }), req.query).q)));
recipes.get('/recipes/:id', handler((req) => getRecipe(idParam(req)) ?? (() => { throw notFound('Recipe not found'); })()));
recipes.post('/recipes', handler((req, res) => { res.status(201); return createRecipe(req.body, actorFrom(req)); }));
recipes.patch('/recipes/:id', handler((req) => updateRecipe(idParam(req), req.body, actorFrom(req))));
recipes.delete('/recipes/:id', handler((req, res) => { deleteRecipe(idParam(req), actorFrom(req)); res.status(204); }));
recipes.get('/recipes/:id/rules', handler((req) => listMenuRules(idParam(req))));
recipes.post('/menu/rules', handler((req, res) => { res.status(201); return createMenuRule(req.body, actorFrom(req)); }));
recipes.delete('/menu/rules/:id', handler((req, res) => { deleteMenuRule(idParam(req), actorFrom(req)); res.status(204); }));

recipes.get('/menu', handler((req) => {
  const q = parse(z.object({ from: zDate, to: zDate }), req.query);
  return listMenu(q.from, q.to);
}));
recipes.post('/menu', handler((req, res) => { res.status(201); return upsertMenuEntry(req.body, actorFrom(req)); }));
recipes.delete('/menu/:id', handler((req, res) => { deleteMenuEntry(idParam(req), actorFrom(req)); res.status(204); }));
