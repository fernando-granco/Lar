import { Router } from 'express';
import { z } from 'zod';
import { db, getSetting, setSetting } from '../db.js';
import { handler, parse, idParam, notFound, badRequest, zColor, zIdList } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { listMembers, listGroups, getMember } from '../repo.js';
import { cfAccessConfigured } from '../auth.js';
import type { Household } from '../../shared/types.js';

export const household = Router();

export function loadHousehold(): Household {
  return {
    settings: {
      household_name: getSetting('household_name', 'Lar'),
      currency: getSetting('currency', 'USD'),
      week_starts_on: (getSetting('week_starts_on', 'monday') as 'monday' | 'sunday') || 'monday',
      allow_private_calendar_urls: getSetting('allow_private_calendar_urls', '0') === '1',
      access_sign_in: cfAccessConfigured,
    },
    members: listMembers(),
    groups: listGroups(),
  };
}

household.get('/household', handler(() => loadHousehold()));

household.patch(
  '/household/settings',
  handler((req) => {
    const body = parse(
      z.object({
        household_name: z.string().trim().min(1).max(60).optional(),
        currency: z.string().trim().length(3).toUpperCase().optional(),
        week_starts_on: z.enum(['monday', 'sunday']).optional(),
        allow_private_calendar_urls: z.boolean().optional(),
      }),
      req.body,
    );
    for (const [k, v] of Object.entries(body)) if (v !== undefined) setSetting(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    logChange(actorFrom(req), 'updated', 'household', null, 'Updated household settings');
    return loadHousehold().settings;
  }),
);

// ---------- Members ----------

const memberBody = z.object({
  name: z.string().trim().min(1).max(40),
  color: zColor.optional(),
  initials: z.string().trim().max(3).optional(),
  email: z.string().trim().toLowerCase().email().max(120).nullable().optional(),
});

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

household.post(
  '/members',
  handler((req, res) => {
    const body = parse(memberBody, req.body);
    const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM members').get() as any).n;
    const result = db
      .prepare('INSERT INTO members (name, color, initials, sort_order, email) VALUES (?, ?, ?, ?, ?)')
      .run(body.name, body.color ?? pickColor(order), body.initials || initialsFor(body.name), order, body.email || null);
    const member = getMember(Number(result.lastInsertRowid))!;
    logChange(actorFrom(req), 'created', 'household', member.id, `Added ${member.name} to the household`);
    res.status(201);
    return member;
  }),
);

household.patch(
  '/members/:id',
  handler((req) => {
    const id = idParam(req);
    const current = getMember(id);
    if (!current) throw notFound('Member not found');
    const body = parse(memberBody.partial().extend({ archived: z.boolean().optional(), sort_order: z.number().int().optional() }), req.body);
    db.prepare('UPDATE members SET name = ?, color = ?, initials = ?, archived = ?, sort_order = ?, email = ? WHERE id = ?').run(
      body.name ?? current.name,
      body.color ?? current.color,
      body.initials ?? (body.name ? initialsFor(body.name) : current.initials),
      body.archived === undefined ? (current.archived ? 1 : 0) : body.archived ? 1 : 0,
      body.sort_order ?? current.sort_order,
      body.email === undefined ? current.email : body.email || null,
      id,
    );
    const member = getMember(id)!;
    logChange(actorFrom(req), 'updated', 'household', id, `Updated ${member.name}`);
    return member;
  }),
);

household.delete(
  '/members/:id',
  handler((req, res) => {
    const id = idParam(req);
    const current = getMember(id);
    if (!current) throw notFound('Member not found');
    db.prepare('DELETE FROM members WHERE id = ?').run(id);
    logChange(actorFrom(req), 'deleted', 'household', id, `Removed ${current.name} from the household`);
    res.status(204);
  }),
);

household.post(
  '/members/reorder',
  handler((req) => {
    const { ids } = parse(z.object({ ids: zIdList }), req.body);
    const upd = db.prepare('UPDATE members SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
    logChange(actorFrom(req), 'reordered', 'household', null, 'Reordered members');
    return listMembers();
  }),
);

// ---------- Groups ----------

const groupBody = z.object({
  name: z.string().trim().min(1).max(40),
  color: zColor.optional(),
  member_ids: zIdList.optional(),
});

function setGroupMembers(groupId: number, memberIds: number[]) {
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  const ins = db.prepare('INSERT OR IGNORE INTO group_members (group_id, member_id) VALUES (?, ?)');
  for (const m of new Set(memberIds)) ins.run(groupId, m);
}

household.post(
  '/groups',
  handler((req, res) => {
    const body = parse(groupBody, req.body);
    const order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM groups').get() as any).n;
    const id = Number(db.prepare('INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)').run(body.name, body.color ?? '#7c6f9b', order).lastInsertRowid);
    setGroupMembers(id, body.member_ids ?? []);
    logChange(actorFrom(req), 'created', 'household', id, `Created group ${body.name}`);
    res.status(201);
    return listGroups().find((g) => g.id === id);
  }),
);

household.patch(
  '/groups/:id',
  handler((req) => {
    const id = idParam(req);
    const current = listGroups().find((g) => g.id === id);
    if (!current) throw notFound('Group not found');
    const body = parse(groupBody.partial(), req.body);
    db.prepare('UPDATE groups SET name = ?, color = ? WHERE id = ?').run(body.name ?? current.name, body.color ?? current.color, id);
    if (body.member_ids) setGroupMembers(id, body.member_ids);
    logChange(actorFrom(req), 'updated', 'household', id, `Updated group ${body.name ?? current.name}`);
    return listGroups().find((g) => g.id === id);
  }),
);

household.delete(
  '/groups/:id',
  handler((req, res) => {
    const id = idParam(req);
    const current = listGroups().find((g) => g.id === id);
    if (!current) throw notFound('Group not found');
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    logChange(actorFrom(req), 'deleted', 'household', id, `Deleted group ${current.name}`);
    res.status(204);
  }),
);

const PALETTE = ['#345a51', '#db744f', '#7c6f9b', '#c8913a', '#3f6f9e', '#a4494f', '#5e8f5a', '#8a6b4e'];
export function pickColor(index: number) {
  return PALETTE[index % PALETTE.length]!;
}

export function assertMembersExist(ids: number[]) {
  for (const id of ids) if (!getMember(id)) throw badRequest(`Member ${id} does not exist`);
}
