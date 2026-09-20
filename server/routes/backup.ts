import { Router, json } from 'express';
import { db } from '../db.js';
import { handler, badRequest } from '../http.js';
import { actorFrom, logChange } from '../context.js';
import { todayIso } from '../repo.js';

export const backup = Router();

/** Tables in dependency order, so a restore can insert top to bottom and delete bottom to top. */
const TABLES = [
  'settings',
  'members',
  'groups',
  'group_members',
  'projects',
  'project_members',
  'milestones',
  'shopping_lists',
  'shopping_items',
  'tasks',
  'assignments',
  'expenses',
  'project_links',
  'activity',
  'shopping_history',
  'calendars',
  'unlocks',
] as const;

export function exportAll() {
  const tables: Record<string, unknown[]> = {};
  // Unlock tokens authorize individual devices. They should never be portable
  // to another installation or copied into an archive.
  for (const t of TABLES) tables[t] = t === 'unlocks' ? [] : db.prepare(`SELECT * FROM ${t}`).all();
  return { app: 'lar', version: 1, exported_at: new Date().toISOString(), tables };
}

backup.get(
  '/backup',
  handler((_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="lar-backup-${todayIso()}.json"`);
    return exportAll();
  }),
);

backup.post(
  '/restore',
  json({ limit: '50mb' }),
  handler((req) => {
    const data = req.body as { app?: string; version?: number; tables?: Record<string, unknown[]> };
    if (!data || data.app !== 'lar' || !data.tables) throw badRequest('That file is not a Lar backup.');
    if (data.version !== 1) throw badRequest(`Unsupported backup version ${data.version}.`);
    const counts: Record<string, number> = {};
    db.transaction(() => {
      db.pragma('foreign_keys = OFF');
      try {
        for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
        for (const t of TABLES) {
          const rows = (t === 'unlocks' ? [] : data.tables![t] ?? []) as Record<string, unknown>[];
          const allowed = new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
          let n = 0;
          for (const row of rows) {
            const cols = Object.keys(row).filter((c) => allowed.has(c));
            if (!cols.length) continue;
            db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
            n++;
          }
          counts[t] = n;
        }
        const problems = db.pragma('foreign_key_check') as unknown[];
        if (problems.length) throw badRequest('The backup has broken references and was not restored.');
      } finally {
        db.pragma('foreign_keys = ON');
      }
    })();
    logChange(actorFrom(req), 'updated', 'household', null, 'Restored Lar from a backup');
    return { restored: counts };
  }),
);
