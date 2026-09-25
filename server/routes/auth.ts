import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { handler, parse, idParam, notFound, badRequest, HttpError } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { getMember } from '../repo.js';
import { hashPassword, verifyPassword, issueUnlock, revokeUnlocks, cfAccessEmail, cfAccessConfigured } from '../auth.js';
import { isKid } from '../permissions.js';
import type { Actor } from '../context.js';

export const auth = Router();

// Keyed by member id alone, not by client IP: on a home network the client's
// address is easy to change (a second device, a spoofed X-Forwarded-For when
// Lar is not actually behind a proxy) but there is only ever one profile to
// guess a password for, so this still stops the guessing without a
// forgeable escape hatch. It also keeps the map's size bounded by the
// number of household members, so nothing needs to be pruned over time.
const unlockAttempts = new Map<number, { failures: number; resetAt: number }>();
const ATTEMPT_WINDOW = 15 * 60_000;
const MAX_ATTEMPTS = 5;

/** Unlock a protected person on this device. Returns a token to send as X-Lar-Unlock. */
auth.post(
  '/auth/unlock',
  handler((req) => {
    const body = parse(z.object({ member_id: z.number().int().positive(), password: z.string().max(200) }), req.body);
    const attempt = unlockAttempts.get(body.member_id);
    if (attempt && attempt.resetAt > Date.now() && attempt.failures >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'Too many password attempts. Try again in 15 minutes.');
    }
    if (attempt && attempt.resetAt <= Date.now()) unlockAttempts.delete(body.member_id);
    const row = db.prepare('SELECT id, password_hash FROM members WHERE id = ?').get(body.member_id) as { id: number; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    if (!row.password_hash) return { token: null, member: getMember(row.id) };
    if (!verifyPassword(body.password, row.password_hash)) {
      const current = unlockAttempts.get(body.member_id);
      unlockAttempts.set(body.member_id, { failures: (current?.failures ?? 0) + 1, resetAt: current?.resetAt ?? Date.now() + ATTEMPT_WINDOW });
      throw new HttpError(401, 'Wrong password.');
    }
    unlockAttempts.delete(body.member_id);
    return { token: issueUnlock(row.id), member: getMember(row.id) };
  }),
);

/**
 * Sign in through Cloudflare Access: when Lar is configured with the Access
 * team and audience, the signed identity header picks the person whose email
 * matches and unlocks them even if they have a password.
 */
auth.post(
  '/auth/access',
  handler(async (req) => {
    if (!cfAccessConfigured) return { configured: false, member: null, token: null };
    const email = await cfAccessEmail(req);
    if (!email) return { configured: true, member: null, token: null };
    const row = db.prepare('SELECT id, password_hash FROM members WHERE lower(email) = ? AND archived = 0').get(email) as { id: number; password_hash: string | null } | undefined;
    if (!row) return { configured: true, member: null, token: null, email };
    return { configured: true, member: getMember(row.id), token: row.password_hash ? issueUnlock(row.id) : null };
  }),
);

/**
 * Who may manage a profile's password: the person themselves, or an adult
 * managing a kid's profile. Kids never manage passwords, and nobody sets a
 * password on another adult's profile (that would lock them out of it).
 * Returns true when the current password can be skipped (an adult for a kid).
 */
function passwordManager(actor: Actor, target: { id: number; is_kid: number }): { skipCurrent: boolean } {
  if (actor.type !== 'member' || !actor.id) throw new HttpError(401, 'Pick who you are on this device first.');
  if (isKid(actor)) throw new HttpError(403, 'Kid profiles cannot add or change passwords. Ask an adult in the household.');
  if (actor.id === target.id) return { skipCurrent: false };
  if (target.is_kid) return { skipCurrent: true };
  throw new HttpError(403, "Only this person can set their own password. Pick them on their device and add it there.");
}

/** Set or change a person's password. Changing your own requires the current one; an adult can reset a kid's. */
auth.post(
  '/members/:id/password',
  handler((req) => {
    const id = idParam(req);
    const row = db.prepare('SELECT id, name, is_kid, password_hash FROM members WHERE id = ?').get(id) as { id: number; name: string; is_kid: number; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    const actor = actorFrom(req);
    const { skipCurrent } = passwordManager(actor, row);
    const body = parse(z.object({ password: z.string().min(4, 'Use at least 4 characters').max(200), current: z.string().max(200).optional() }), req.body);
    if (row.password_hash && !skipCurrent && !verifyPassword(body.current ?? '', row.password_hash)) throw new HttpError(401, 'The current password is wrong.');
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), id);
    revokeUnlocks(id);
    // Only the person's own device is unlocked right away; an adult setting a kid's password does not unlock the kid here.
    const token = actor.id === id ? issueUnlock(id) : null;
    const who = actor.id === id ? row.name : `${actor.name} (for ${row.name})`;
    logChange(actor, 'updated', 'household', id, `${who} ${row.password_hash ? 'changed' : 'added'} a profile password`);
    return { token, member: getMember(id) };
  }),
);

/** Remove a person's password. Your own needs the current one; an adult can remove a kid's; the server CLI can reset any. */
auth.delete(
  '/members/:id/password',
  handler((req, res) => {
    const id = idParam(req);
    const row = db.prepare('SELECT id, name, is_kid, password_hash FROM members WHERE id = ?').get(id) as { id: number; name: string; is_kid: number; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    if (!row.password_hash) throw badRequest('This person has no password.');
    const actor = actorFrom(req);
    const { skipCurrent } = passwordManager(actor, row);
    const body = parse(z.object({ current: z.string().max(200).default('') }), req.body ?? {});
    if (!skipCurrent && !verifyPassword(body.current, row.password_hash)) throw new HttpError(401, 'The current password is wrong.');
    db.prepare('UPDATE members SET password_hash = NULL WHERE id = ?').run(id);
    revokeUnlocks(id);
    logChange(actor, 'updated', 'household', id, actor.id === id ? `${row.name} removed their profile password` : `${actor.name} removed ${row.name}'s profile password`);
    res.status(204);
  }),
);
