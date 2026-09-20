import { Router } from 'express';
import { z } from 'zod';
import { db, getSetting, nowIso } from '../db.js';
import { actorFrom, logChange, type Actor } from '../context.js';
import { badRequest, handler, idParam, notFound, parse, zDate } from '../http.js';
import type { MenuEntry, Recipe } from '../../shared/types.js';

export const recipes = Router();

const recipeBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  ingredients: z.string().max(20_000).default(''),
  instructions: z.string().max(30_000).default(''),
  prep_minutes: z.number().int().min(1).max(24 * 60).nullable().default(null),
  tags: z.string().trim().max(300).default(''),
});

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
  if (getSetting('recipes_enabled', '0') !== '1') throw badRequest('Enable Recipes & weekly menu in Household settings first.');
}

export function listRecipes(search?: string): Recipe[] {
  ensureRecipesEnabled();
  return db
    .prepare(`SELECT * FROM recipes ${search ? 'WHERE name LIKE @q OR description LIKE @q OR tags LIKE @q' : ''} ORDER BY name COLLATE NOCASE, id`)
    .all(search ? { q: `%${search}%` } : {}) as Recipe[];
}

export function getRecipe(id: number): Recipe | undefined {
  ensureRecipesEnabled();
  return db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Recipe | undefined;
}

export function createRecipe(input: unknown, actor: Actor): Recipe {
  ensureRecipesEnabled();
  const body = parse(recipeBody, input);
  const id = Number(
    db
      .prepare(`INSERT INTO recipes (name, description, ingredients, instructions, prep_minutes, tags, created_by)
                VALUES (@name, @description, @ingredients, @instructions, @prep_minutes, @tags, @created_by)`)
      .run({ ...body, created_by: actor.type === 'member' ? actor.id : null }).lastInsertRowid,
  );
  const recipe = getRecipe(id)!;
  logChange(actor, 'created', 'recipe', id, `Added recipe "${recipe.name}"`);
  return recipe;
}

export function updateRecipe(id: number, input: unknown, actor: Actor): Recipe {
  const current = getRecipe(id);
  if (!current) throw notFound('Recipe not found');
  const body = parse(recipeBody.partial(), input);
  const next = { ...current, ...body };
  db.prepare(`UPDATE recipes SET name=@name, description=@description, ingredients=@ingredients, instructions=@instructions,
              prep_minutes=@prep_minutes, tags=@tags, updated_at=@updated_at WHERE id=@id`)
    .run({ ...next, updated_at: nowIso() });
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
  return db
    .prepare(`SELECT m.*, r.name AS recipe_name FROM weekly_menu m LEFT JOIN recipes r ON r.id = m.recipe_id
              WHERE m.meal_date >= ? AND m.meal_date <= ?
              ORDER BY m.meal_date, CASE m.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END`)
    .all(from, to) as MenuEntry[];
}

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

recipes.get('/menu', handler((req) => {
  const q = parse(z.object({ from: zDate, to: zDate }), req.query);
  return listMenu(q.from, q.to);
}));
recipes.post('/menu', handler((req, res) => { res.status(201); return upsertMenuEntry(req.body, actorFrom(req)); }));
recipes.delete('/menu/:id', handler((req, res) => { deleteMenuEntry(idParam(req), actorFrom(req)); res.status(204); }));
