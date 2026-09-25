import { Router } from 'express';
import { z } from 'zod';
import ical, { type VEvent, type CalendarResponse } from 'node-ical';
import dns from 'node:dns/promises';
import net from 'node:net';
import { db, getSetting, setSetting, nowIso } from '../db.js';
import { handler, parse, onlySupplied, idParam, notFound, badRequest, zColor, zDate } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { loadTasks, assignedToMemberSql, todayIso } from '../repo.js';
import { requireHousehold } from '../auth.js';
import { assertAdult } from '../permissions.js';
import type { Calendar, CalendarEvent } from '../../shared/types.js';

export const calendar = Router();

// ---------- Outgoing feed: subscribe from Google Calendar or Apple Calendar ----------

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 73) {
    let cut = 73;
    while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), 'utf8') > 73) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
};
const dateVal = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
};
const stampUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Local wall-clock date+time in the server's TZ, expressed as a UTC stamp. */
function localToUtcStamp(dateIso: string, time: string) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return stampUtc(new Date(y!, m! - 1, d!, hh!, mm!));
}

export function buildFeed(memberId?: number): string {
  const name = getSetting('household_name', 'Lar');
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lar//Household//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  const now = stampUtc(new Date());

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const where = ["t.due_date IS NOT NULL AND (t.status = 'open' OR t.completed_at >= @cutoff)"];
  const params: Record<string, unknown> = { cutoff: cutoff.toISOString() };
  if (memberId) (where.push(assignedToMemberSql('task', 't')), (params.member = memberId));
  const projectNames = new Map((db.prepare('SELECT id, name FROM projects').all() as any[]).map((p) => [p.id, p.name as string]));

  for (const t of loadTasks(where.join(' AND '), params)) {
    const done = t.status === 'done';
    const title = `${done ? '✓ ' : ''}${t.title}`;
    const desc = [t.notes, t.project_id ? `Project: ${projectNames.get(t.project_id)}` : '', `Lar to-do #${t.id}`].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:lar-task-${t.id}@lar`, `DTSTAMP:${now}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`);
    if (t.due_time) {
      const start = localToUtcStamp(t.due_date!, t.due_time);
      const endDate = new Date(new Date(start.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')).getTime() + 3600_000);
      lines.push(`DTSTART:${start}`, `DTEND:${stampUtc(endDate)}`);
    } else lines.push(`DTSTART;VALUE=DATE:${dateVal(t.due_date!)}`, `DTEND;VALUE=DATE:${nextDay(t.due_date!)}`);
    if (done) lines.push('STATUS:CANCELLED', 'TRANSP:TRANSPARENT');
    else lines.push('STATUS:CONFIRMED', 'TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  const milestones = db
    .prepare(`SELECT m.*, p.name AS project_name FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.due_date IS NOT NULL AND p.archived = 0 ${memberId ? 'AND (p.owner_id = @member OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_id = @member))' : ''}`)
    .all(memberId ? { member: memberId } : {}) as any[];
  for (const m of milestones) {
    lines.push('BEGIN:VEVENT', `UID:lar-milestone-${m.id}@lar`, `DTSTAMP:${now}`, `SUMMARY:${esc(`${m.done_at ? '✓ ' : '◆ '}${m.title} (${m.project_name})`)}`, `DESCRIPTION:${esc([m.description, `Milestone of project "${m.project_name}"`].filter(Boolean).join('\n'))}`, `DTSTART;VALUE=DATE:${dateVal(m.due_date)}`, `DTEND;VALUE=DATE:${nextDay(m.due_date)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }

  const projects = db
    .prepare(`SELECT id, name, target_date FROM projects p WHERE target_date IS NOT NULL AND archived = 0 AND status <> 'done' ${memberId ? 'AND (p.owner_id = @member OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_id = @member))' : ''}`)
    .all(memberId ? { member: memberId } : {}) as any[];
  for (const p of projects) {
    lines.push('BEGIN:VEVENT', `UID:lar-project-${p.id}@lar`, `DTSTAMP:${now}`, `SUMMARY:${esc(`🎯 ${p.name} target`)}`, `DTSTART;VALUE=DATE:${dateVal(p.target_date)}`, `DTEND;VALUE=DATE:${nextDay(p.target_date)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Public (token-protected) feed, mounted outside /api so calendar apps can fetch it with a plain GET. */
export function feedHandler(req: import('express').Request, res: import('express').Response) {
  const token = getSetting('feed_token');
  if (!token || req.query.token !== token) {
    res.status(403).type('text/plain').send('Invalid feed token. Copy the feed address from Lar under Settings → Connections.');
    return;
  }
  const member = req.query.member ? Number(req.query.member) : undefined;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="lar.ics"');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(buildFeed(member && Number.isInteger(member) ? member : undefined));
}

// The feed link is a bearer secret (anyone who has it can read the whole
// household's schedule), so reading or rotating it needs to be someone on
// the household, not just anyone who can reach the server.
calendar.get('/calendar/feed-info', requireHousehold({ allowKid: true }), handler(() => ({ token: getSetting('feed_token'), path: '/calendar/lar.ics' })));

calendar.post(
  '/calendar/feed-token/rotate',
  requireHousehold({ allowKid: false }),
  handler((req) => {
    const token = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
    setSetting('feed_token', token);
    logChange(actorFrom(req), 'updated', 'household', null, 'Rotated the calendar feed address');
    return { token, path: '/calendar/lar.ics' };
  }),
);

// ---------- Incoming calendars: private iCal links from Google / Apple / anywhere ----------

const mapCal = (r: any): Calendar => ({ ...r, enabled: !!r.enabled });
const listCalendars = (): Calendar[] => (db.prepare('SELECT * FROM calendars ORDER BY id').all() as any[]).map(mapCal);
const getCalendar = (id: number): Calendar | undefined => {
  const r = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
  return r ? mapCal(r) : undefined;
};

calendar.get('/calendars', handler(() => listCalendars()));

const calBody = z.object({
  name: z.string().trim().min(1).max(60),
  url: z
    .string()
    .trim()
    .max(2000)
    .transform((u) => u.replace(/^webcal:\/\//i, 'https://'))
    .refine((u) => /^https?:\/\//i.test(u), 'Expected an http(s) or webcal link'),
  color: zColor.optional(),
  enabled: z.boolean().optional(),
});

calendar.post(
  '/calendars',
  handler(async (req, res) => {
    assertAdult(actorFrom(req), 'connect calendars');
    const body = parse(calBody, req.body);
    // Try it once so a bad link fails loudly.
    try {
      await fetchCalendar(body.url);
    } catch (e) {
      throw badRequest(`Could not read that calendar: ${(e as Error).message}`);
    }
    const id = Number(db.prepare('INSERT INTO calendars (name, url, color, enabled, last_fetched_at) VALUES (?, ?, ?, 1, ?)').run(body.name, body.url, body.color ?? '#3f6f9e', nowIso()).lastInsertRowid);
    logChange(actorFrom(req), 'created', 'household', id, `Connected calendar "${body.name}"`);
    res.status(201);
    return getCalendar(id);
  }),
);

calendar.patch(
  '/calendars/:id',
  handler((req) => {
    const id = idParam(req);
    const cur = getCalendar(id);
    if (!cur) throw notFound('Calendar not found');
    assertAdult(actorFrom(req), 'change calendars');
    const body = onlySupplied(req.body, parse(calBody.partial(), req.body));
    db.prepare('UPDATE calendars SET name = ?, url = ?, color = ?, enabled = ? WHERE id = ?').run(body.name ?? cur.name, body.url ?? cur.url, body.color ?? cur.color, (body.enabled ?? cur.enabled) ? 1 : 0, id);
    if (body.url && body.url !== cur.url) cache.delete(cur.url);
    logChange(actorFrom(req), 'updated', 'household', id, `Updated calendar "${body.name ?? cur.name}"`);
    return getCalendar(id);
  }),
);

calendar.delete(
  '/calendars/:id',
  handler((req, res) => {
    const id = idParam(req);
    const cur = getCalendar(id);
    if (!cur) throw notFound('Calendar not found');
    assertAdult(actorFrom(req), 'remove calendars');
    db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
    cache.delete(cur.url);
    logChange(actorFrom(req), 'deleted', 'household', id, `Removed calendar "${cur.name}"`);
    res.status(204);
  }),
);

// Small in-memory cache so the Today page does not hammer Google every refresh.
const cache = new Map<string, { at: number; data: CalendarResponse }>();
const TTL = 10 * 60 * 1000;

/** True for loopback, private, link-local, and other non-public addresses. */
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateAddress(mapped[1]!) : false;
}

/** Unless the household allowed it, refuse calendar links that point inside the network the server sits on. */
async function assertPublicHost(url: string) {
  if (getSetting('allow_private_calendar_urls', '0') === '1') return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('links to your local network are not allowed (enable them in Household settings)');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error('links to your local network are not allowed (enable them in Household settings)');
}

async function fetchCalendar(url: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let text = '';
  try {
    // Follow redirects by hand so every hop is checked against the private-network rule.
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicHost(current);
      const res = await fetch(current, { headers: { 'User-Agent': 'Lar/0.2 (+https://github.com/fernando-granco/Lar)' }, signal: controller.signal, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      break;
    }
    if (!text) throw new Error('too many redirects');
  } finally {
    clearTimeout(timer);
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return an iCalendar file');
  const data = await ical.async.parseICS(text);
  cache.set(url, { at: Date.now(), data });
  return data;
}

const val = (v: unknown): string => (v && typeof v === 'object' && 'val' in (v as object) ? String((v as { val: unknown }).val ?? '') : v == null ? '' : String(v));

export async function upcomingEvents(days: number): Promise<CalendarEvent[]> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return eventsBetween(from, to);
}

export async function eventsBetween(from: Date, to: Date): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  for (const cal of listCalendars().filter((c) => c.enabled)) {
    try {
      const data = await fetchCalendar(cal.url);
      for (const item of Object.values(data)) {
        if (!item || (item as any).type !== 'VEVENT') continue;
        const ev = item as VEvent;
        const instances = ev.rrule
          ? ical.expandRecurringEvent(ev, { from, to, expandOngoing: true })
          : (() => {
              const start = ev.start as Date | undefined;
              const end = (ev.end as Date | undefined) ?? start;
              if (!start || !end) return [];
              if (end < from || start > to) return [];
              return [{ start, end, summary: ev.summary, isFullDay: ev.datetype === 'date', event: ev }];
            })();
        for (const inst of instances) {
          // All-day events carry plain local dates so no timezone shift can move them to the wrong day.
          const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          out.push({
            calendar_id: cal.id,
            calendar: cal.name,
            color: cal.color,
            title: val(inst.summary) || '(untitled)',
            start: inst.isFullDay ? localDate(inst.start) : inst.start.toISOString(),
            end: inst.isFullDay ? localDate(inst.end) : inst.end.toISOString(),
            all_day: inst.isFullDay,
            location: val(inst.event.location) || undefined,
          });
        }
      }
      db.prepare('UPDATE calendars SET last_fetched_at = ?, last_error = NULL WHERE id = ?').run(nowIso(), cal.id);
    } catch (e) {
      db.prepare('UPDATE calendars SET last_error = ? WHERE id = ?').run((e as Error).message.slice(0, 300), cal.id);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Everything dated inside a range: to-dos, milestones, project targets, and external events. */
calendar.get(
  '/calendar/agenda',
  handler(async (req) => {
    const q = parse(z.object({ from: zDate, to: zDate, member: z.coerce.number().int().positive().optional() }), req.query);
    const params: Record<string, unknown> = { from: q.from, to: q.to, member: q.member };
    const taskWhere = ['t.due_date >= @from', 't.due_date <= @to'];
    if (q.member) taskWhere.push(assignedToMemberSql('task', 't'));
    const memberSql = q.member ? 'AND (p.owner_id = @member OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_id = @member))' : '';
    const milestones = db
      .prepare(`SELECT m.id, m.project_id, p.name AS project_name, p.color, m.title, m.due_date, (m.done_at IS NOT NULL) AS done FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.due_date >= @from AND m.due_date <= @to AND p.archived = 0 ${memberSql} ORDER BY m.due_date`)
      .all(params) as any[];
    const projects = db
      .prepare(`SELECT p.id, p.name, p.color, p.target_date, p.status FROM projects p WHERE p.target_date >= @from AND p.target_date <= @to AND p.archived = 0 ${memberSql} ORDER BY p.target_date`)
      .all(params) as any[];
    const [fy, fm, fd] = q.from.split('-').map(Number);
    const [ty, tm, td] = q.to.split('-').map(Number);
    const events = listCalendars().some((c) => c.enabled) ? await eventsBetween(new Date(fy!, fm! - 1, fd!), new Date(ty!, tm! - 1, td!, 23, 59, 59)) : [];
    return {
      from: q.from,
      to: q.to,
      tasks: loadTasks(taskWhere.join(' AND '), params),
      milestones: milestones.map((m) => ({ ...m, done: !!m.done })),
      projects,
      events,
    };
  }),
);

calendar.get(
  '/calendar/events',
  handler(async (req) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(60).default(7) }), req.query);
    return { today: todayIso(), events: await upcomingEvents(days) };
  }),
);
