import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Plus, Search, Soup, Trash2, Utensils } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { addDays, friendlyDate, today } from '@/lib/format';
import { Button, Card, Empty, Field, Input, Select, TextArea } from '@/components/ui';
import { Confirm, Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import type { MealType, Recipe } from '@shared/types';

const MEALS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
];

export function Recipes() {
  const { data: household } = useHousehold();
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Recipe | 'new' | null>(null);
  const weekStart = startOfWeek(addDays(today(), weekOffset * 7), household?.settings.week_starts_on ?? 'monday');
  const weekEnd = addDays(weekStart, 6);
  const recipesQ = useQuery({ queryKey: keys.recipes(), queryFn: () => api.recipes() });
  const menuQ = useQuery({ queryKey: keys.menu({ from: weekStart, to: weekEnd }), queryFn: () => api.menu(weekStart, weekEnd) });
  const setMeal = useInvalidatingMutation(async ({ date, type, recipeId }: { date: string; type: MealType; recipeId: number | null }) => {
    const existing = menuQ.data?.find((m) => m.meal_date === date && m.meal_type === type);
    if (!recipeId) {
      if (existing) await api.deleteMenuEntry(existing.id);
      return;
    }
    await api.setMenuEntry({ meal_date: date, meal_type: type, recipe_id: recipeId });
  }, ['menu']);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const filteredRecipes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return recipesQ.data ?? [];
    return (recipesQ.data ?? []).filter((recipe) => `${recipe.name} ${recipe.description} ${recipe.tags}`.toLowerCase().includes(needle));
  }, [recipesQ.data, search]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Recipes & menu</h1>
          <p className="sub">Keep family favourites and make the week visible to everyone.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>Add recipe</Button>
      </header>

      <Card
        title="Weekly menu"
        icon={Utensils}
        action={
          <div className="row" style={{ gap: 4 }}>
            <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous week" onClick={() => setWeekOffset((n) => n - 1)} />
            <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>{weekOffset === 0 ? 'This week' : `${friendlyDate(weekStart)} – ${friendlyDate(weekEnd)}`}</Button>
            <Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next week" onClick={() => setWeekOffset((n) => n + 1)} />
          </div>
        }
      >
        <div className="menu-week">
          {days.map((date) => (
            <section key={date} className={date === today() ? 'today' : ''}>
              <header><b>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</b><span>{friendlyDate(date)}</span></header>
              {MEALS.map((meal) => {
                const entry = menuQ.data?.find((m) => m.meal_date === date && m.meal_type === meal.value);
                return (
                  <label key={meal.value}>
                    <span>{meal.label}</span>
                    <Select
                      aria-label={`${meal.label} on ${friendlyDate(date)}`}
                      value={entry?.recipe_id ?? (entry ? `custom:${entry.id}` : '')}
                      onChange={(e) => setMeal.mutate({ date, type: meal.value, recipeId: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Not planned</option>
                      {entry && !entry.recipe_id && <option value={`custom:${entry.id}`}>{entry.custom_title}</option>}
                      {(recipesQ.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </label>
                );
              })}
            </section>
          ))}
        </div>
      </Card>

      <div className="row wrap">
        <div className="quick-add grow">
          <Search />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipes…" aria-label="Search recipes" />
        </div>
      </div>

      {filteredRecipes.length ? (
        <div className="recipe-grid">
          {filteredRecipes.map((recipe) => (
            <button type="button" key={recipe.id} className="card recipe-card" onClick={() => setEdit(recipe)}>
              <span className="icon-badge"><Soup /></span>
              <div>
                <h2>{recipe.name}</h2>
                {recipe.description && <p>{recipe.description}</p>}
              </div>
              <div className="meta">
                {recipe.prep_minutes && <span><Clock /> {recipe.prep_minutes} min</span>}
                {recipe.tags && <span>{recipe.tags}</span>}
              </div>
            </button>
          ))}
        </div>
      ) : recipesQ.isLoading ? null : (
        <Card><Empty icon={Soup} title={search ? 'No recipes found' : 'No recipes yet'} hint={search ? 'Try a different search.' : 'Add the first family favourite.'} /></Card>
      )}

      <RecipeSheet open={edit !== null} recipe={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function RecipeSheet({ open, recipe, onClose }: { open: boolean; recipe: Recipe | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [tags, setTags] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(recipe?.name ?? '');
    setDescription(recipe?.description ?? '');
    setIngredients(recipe?.ingredients ?? '');
    setInstructions(recipe?.instructions ?? '');
    setMinutes(recipe?.prep_minutes ?? null);
    setTags(recipe?.tags ?? '');
  }, [open, recipe]);
  const save = useInvalidatingMutation(() => {
    const body = { name: name.trim(), description, ingredients, instructions, prep_minutes: minutes, tags };
    return recipe ? api.updateRecipe(recipe.id, body) : api.createRecipe(body);
  }, ['recipes']);
  const remove = useInvalidatingMutation(() => api.deleteRecipe(recipe!.id), ['recipes', 'menu']);
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={recipe ? 'Edit recipe' : 'New recipe'}
        wide
        footer={
          <>
            {recipe && <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="primary" className="right" type="submit" form="recipe-form" disabled={!name.trim() || save.isPending}>Save recipe</Button>
          </>
        }
      >
        <form id="recipe-form" className="form" onSubmit={async (e) => { e.preventDefault(); await save.mutateAsync(undefined as never); toast(recipe ? 'Recipe saved' : 'Recipe added'); onClose(); }}>
          <Field label="Recipe name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Sunday lasagna" /></Field>
          <Field label="Short description" hint="optional"><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Why the family loves it" /></Field>
          <Field label="Ingredients" hint="one per line"><TextArea value={ingredients} onChange={(e) => setIngredients(e.target.value)} style={{ minHeight: 140 }} placeholder={'500 g pasta\n2 cups tomato sauce\n…'} /></Field>
          <Field label="Instructions"><TextArea value={instructions} onChange={(e) => setInstructions(e.target.value)} style={{ minHeight: 170 }} placeholder={'1. Prepare…\n2. Cook…'} /></Field>
          <div className="form-grid">
            <Field label="Time" hint="minutes"><Input type="number" min={1} max={1440} inputMode="numeric" value={minutes ?? ''} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Tags" hint="comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={300} placeholder="quick, vegetarian, favourite" /></Field>
          </div>
        </form>
      </Sheet>
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete "${recipe?.name}"?`} body="It will also be removed from future menu slots." onConfirm={async () => { await remove.mutateAsync(undefined as never); toast('Recipe deleted'); onClose(); }} />
    </>
  );
}

function startOfWeek(date: string, starts: 'monday' | 'sunday') {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  const delta = starts === 'monday' ? (day + 6) % 7 : day;
  return addDays(date, -delta);
}
