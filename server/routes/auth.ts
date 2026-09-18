import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { handler, parse, idParam, notFound, badRequest, HttpError } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { getMember } from '../repo.js';
import { hashPassword, verifyPassword, issueUnlock, revokeUnlocks, cfAccessEmail, cfAccessConfigured } from '../auth.js';

export const auth = Router();

/** Unlock a protected person on this device. Returns a token to send as X-Lar-Unlock. */
auth.post(
  '/auth/unlock',
  handler((req) => {
    const body = parse(z.object({ member_id: z.number().int().positive(), password: z.string().max(200) }), req.body);
    const row = db.prepare('SELECT id, password_hash FROM members WHERE id = ?').get(body.member_id) as { id: number; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    if (!row.password_hash) return { token: null, member: getMember(row.id) };
    if (!verifyPassword(body.password, row.password_hash)) throw new HttpError(401, 'Wrong password.');
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

/** Set or change a person's password. Changing requires the current one. */
auth.post(
  '/members/:id/password',
  handler((req) => {
    const id = idParam(req);
    const row = db.prepare('SELECT id, name, password_hash FROM members WHERE id = ?').get(id) as { id: number; name: string; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    const body = parse(z.object({ password: z.string().min(4, 'Use at least 4 characters').max(200), current: z.string().max(200).optional() }), req.body);
    if (row.password_hash && !verifyPassword(body.current ?? '', row.password_hash)) throw new HttpError(401, 'The current password is wrong.');
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), id);
    revokeUnlocks(id);
    const token = issueUnlock(id);
    logChange(actorFrom(req), 'updated', 'household', id, `${row.name} ${row.password_hash ? 'changed' : 'added'} a profile password`);
    return { token, member: getMember(id) };
  }),
);

/** Remove a person's password. Requires the current one; the server CLI can reset it without. */
auth.delete(
  '/members/:id/password',
  handler((req, res) => {
    const id = idParam(req);
    const row = db.prepare('SELECT id, name, password_hash FROM members WHERE id = ?').get(id) as { id: number; name: string; password_hash: string | null } | undefined;
    if (!row) throw notFound('Member not found');
    if (!row.password_hash) throw badRequest('This person has no password.');
    const body = parse(z.object({ current: z.string().max(200) }), req.body ?? {});
    if (!verifyPassword(body.current, row.password_hash)) throw new HttpError(401, 'The current password is wrong.');
    db.prepare('UPDATE members SET password_hash = NULL WHERE id = ?').run(id);
    revokeUnlocks(id);
    logChange(actorFrom(req), 'updated', 'household', id, `${row.name} removed their profile password`);
    res.status(204);
  }),
);
