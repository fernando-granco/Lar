/**
 * What kid profiles may do.
 *
 * Kids can always add to-dos and shopping items, check things off, and edit
 * or delete what they created themselves. Adults can widen that per area in
 * Settings → People. Household-wide settings, people, groups, calendars,
 * passwords, agent access, and backups always need an adult.
 *
 * These checks live in the shared create/update/delete functions, so the REST
 * API and anything else calling them behave the same. Agents are not kids.
 */
import { db, getSetting } from './db.js';
import { HttpError } from './http.js';
import type { Actor } from './context.js';
import type { KidPermission, KidPermissions } from '../shared/types.js';

const KID_PERMISSIONS: KidPermission[] = ['todos', 'shopping', 'projects', 'recipes'];

export function kidPermissions(): KidPermissions {
  return Object.fromEntries(KID_PERMISSIONS.map((k) => [k, getSetting(`kids_can_${k}`, '0') === '1'])) as unknown as KidPermissions;
}

export function isKid(actor: Actor): boolean {
  if (actor.type !== 'member' || !actor.id) return false;
  const row = db.prepare('SELECT is_kid FROM members WHERE id = ?').get(actor.id) as { is_kid: number } | undefined;
  return !!row?.is_kid;
}

const AREA: Record<KidPermission, string> = {
  todos: "other people's to-dos",
  shopping: "other people's shopping items and lists",
  projects: 'projects someone else started',
  recipes: 'recipes someone else added or the weekly menu',
};

/** Kids may not do this at all. */
export function assertAdult(actor: Actor, what = 'do this') {
  if (isKid(actor)) throw new HttpError(403, `Kid profiles cannot ${what}. Ask an adult in the household.`, { code: 'adult_required' });
}

/**
 * Kids may change something if they created it, or if an adult allowed kids
 * to change that area. Pass `createdBy` undefined for actions that touch many
 * people's things at once (clearing lists, planning the menu).
 */
export function assertKidMay(actor: Actor, area: KidPermission, createdBy?: number | null) {
  if (!isKid(actor)) return;
  if (createdBy !== undefined && createdBy !== null && createdBy === actor.id) return;
  if (kidPermissions()[area]) return;
  throw new HttpError(403, `Kid profiles cannot change ${AREA[area]}. Ask an adult, or an adult can allow it in Settings → People.`, { code: 'kid_not_allowed' });
}

/** The household must always keep at least one adult who can manage it. */
export function assertKeepsAnAdult(changingMemberId: number) {
  const others = db.prepare('SELECT COUNT(*) AS n FROM members WHERE is_kid = 0 AND archived = 0 AND id <> ?').get(changingMemberId) as { n: number };
  if (others.n === 0) throw new HttpError(400, 'Lar needs at least one adult profile to manage the household.');
}
