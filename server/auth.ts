/**
 * Optional profile protection.
 *
 * Lar stays an open LAN app: anyone can pick any person. A person may add a
 * password to their profile; then a device must unlock that profile once and
 * gets a token it sends with every request as `X-Lar-Unlock`. Requests that
 * act as a protected person without a valid token are refused.
 *
 * When Cloudflare Access sits in front of Lar and is configured, its signed
 * identity picks and unlocks the matching person automatically.
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, nowIso } from './db.js';

// ---------- passwords ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password.normalize('NFKC'), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------- unlock tokens ----------

export function issueUnlock(memberId: number): string {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO unlocks (token, member_id) VALUES (?, ?)').run(token, memberId);
  return token;
}

export function revokeUnlocks(memberId: number) {
  db.prepare('DELETE FROM unlocks WHERE member_id = ?').run(memberId);
}

function unlockValid(token: string | undefined, memberId: number): boolean {
  if (!token) return false;
  const row = db.prepare('SELECT member_id, last_seen_at FROM unlocks WHERE token = ?').get(token) as { member_id: number; last_seen_at: string } | undefined;
  if (!row || row.member_id !== memberId) return false;
  // A forgotten device should not stay authorized forever. Active devices
  // renew this rolling window every time they use Lar.
  if (Date.now() - Date.parse(row.last_seen_at) > 180 * 24 * 3600_000) {
    db.prepare('DELETE FROM unlocks WHERE token = ?').run(token);
    return false;
  }
  db.prepare('UPDATE unlocks SET last_seen_at = ? WHERE token = ?').run(nowIso(), token);
  return true;
}

export function memberIsProtected(memberId: number): boolean {
  const row = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(memberId) as { password_hash: string | null } | undefined;
  return !!row?.password_hash;
}

/** Refuse requests that act as a protected person without having unlocked them on this device. */
export function requireUnlock(req: Request, res: Response, next: NextFunction) {
  const memberId = Number(req.header('x-lar-member'));
  if (!(memberId > 0) || !memberIsProtected(memberId)) return next();
  if (unlockValid(req.header('x-lar-unlock'), memberId)) return next();
  res.status(401).json({ error: 'This person is protected. Enter their password to continue.', code: 'locked', member_id: memberId });
}

// ---------- agent key ----------

// Optional agent key. When LAR_API_KEY is set, /mcp and any /api request that
// identifies as an agent (X-Lar-Agent) must send it as a Bearer token or
// X-Api-Key. Lar otherwise stays an open household app: it does not gate
// ordinary browser use. A few endpoints that expose more than one person
// should reasonably see (a full data export, restoring the database, the
// private calendar feed link) additionally accept this key as a way for
// scripts and backups to reach them without picking a person.
const agentKey = process.env.LAR_API_KEY?.trim();
if (agentKey && agentKey.length < 32) {
  throw new Error('LAR_API_KEY must be at least 32 characters. Generate a random key instead of using a memorable password.');
}
export const agentKeyConfigured = !!agentKey;

export function agentKeyMatches(supplied: string | undefined): boolean {
  if (!agentKey || !supplied) return false;
  const expected = crypto.createHash('sha256').update(agentKey).digest();
  const candidate = crypto.createHash('sha256').update(supplied).digest();
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export function suppliedAgentKey(req: Request): string | undefined {
  return req.header('x-api-key') || req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
}

// ---------- sensitive household routes ----------

/**
 * Guards the handful of routes that hand back more than a normal household
 * member should stumble into by accident: a full data export (with password
 * hashes), a database restore, or the private calendar feed link. Anyone who
 * has picked themselves on this device may use them, same as the rest of
 * Lar's open design — this only stops a device that has never identified
 * itself at all, and (when asked) keeps them for adults. A configured
 * LAR_API_KEY also gets in, so backups can be scripted.
 */
export function requireHousehold(opts: { allowKid?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (agentKeyMatches(suppliedAgentKey(req))) return next();
    const memberId = Number(req.header('x-lar-member'));
    if (!(memberId > 0)) {
      res.status(401).json({ error: 'Pick who you are on this device first.', code: 'member_required' });
      return;
    }
    const row = db.prepare('SELECT id, is_kid FROM members WHERE id = ? AND archived = 0').get(memberId) as { id: number; is_kid: number } | undefined;
    if (!row) {
      res.status(401).json({ error: 'Pick who you are on this device first.', code: 'member_required' });
      return;
    }
    if (!opts.allowKid && row.is_kid) {
      res.status(403).json({ error: 'An adult in the household needs to do this.', code: 'adult_required' });
      return;
    }
    next();
  };
}

// ---------- Cloudflare Access ----------

const team = process.env.LAR_CF_ACCESS_TEAM; // e.g. "myfamily" for myfamily.cloudflareaccess.com
const audience = process.env.LAR_CF_ACCESS_AUD; // the application's Audience (AUD) tag
export const cfAccessConfigured = !!(team && audience);

type Jwk = crypto.webcrypto.JsonWebKey & { kid?: string };
let jwks: { keys: Jwk[]; at: number } | null = null;
async function fetchKeys() {
  if (jwks && Date.now() - jwks.at < 6 * 3600_000) return jwks.keys;
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const data = (await res.json()) as { keys: Jwk[] };
  jwks = { keys: data.keys, at: Date.now() };
  return data.keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Verify the `Cf-Access-Jwt-Assertion` header and return the signed-in email, or null. */
export async function cfAccessEmail(req: Request): Promise<string | null> {
  if (!cfAccessConfigured) return null;
  const jwt = req.header('cf-access-jwt-assertion');
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64url(parts[0]!).toString('utf8')) as { kid?: string; alg?: string };
    const payload = JSON.parse(b64url(parts[1]!).toString('utf8')) as { aud?: string | string[]; exp?: number; email?: string; iss?: string };
    if (header.alg !== 'RS256') return null;
    const keys = await fetchKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]!));
    if (!ok) return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(audience!)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== `https://${team}.cloudflareaccess.com`) return null;
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
