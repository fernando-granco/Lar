import type { Request } from 'express';
import { db } from './db.js';
import { publish } from './events.js';
import type { ChangeEvent } from '../shared/types.js';

/**
 * Lar has no logins. The browser sends the chosen household member in
 * `X-Lar-Member`; agents identify themselves with `X-Lar-Agent`.
 */
export interface Actor {
  type: 'member' | 'agent' | 'system';
  id: number | null;
  name: string;
}

export function actorFrom(req: Request): Actor {
  const agent = req.header('x-lar-agent');
  if (agent) return { type: 'agent', id: null, name: agent.slice(0, 60) };
  const memberId = Number(req.header('x-lar-member'));
  if (memberId > 0) {
    const row = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId) as { id: number; name: string } | undefined;
    if (row) return { type: 'member', id: row.id, name: row.name };
  }
  return { type: 'system', id: null, name: 'Someone' };
}

const insertActivity = db.prepare(`
  INSERT INTO activity (actor_type, actor_id, actor_name, action, entity_type, entity_id, summary, data)
  VALUES (@actor_type, @actor_id, @actor_name, @action, @entity_type, @entity_id, @summary, @data)
`);

/** Record what happened and tell connected browsers to refresh. */
export function logChange(
  actor: Actor,
  action: ChangeEvent['action'] | string,
  entity: ChangeEvent['entity'],
  entityId: number | null,
  summary: string,
  data?: unknown,
) {
  insertActivity.run({
    actor_type: actor.type,
    actor_id: actor.id,
    actor_name: actor.name,
    action,
    entity_type: entity,
    entity_id: entityId,
    summary,
    data: data === undefined ? null : JSON.stringify(data),
  });
  const known: ChangeEvent['action'][] = ['created', 'updated', 'deleted', 'reordered'];
  publish({
    entity,
    id: entityId ?? undefined,
    action: (known.includes(action as ChangeEvent['action']) ? action : 'updated') as ChangeEvent['action'],
    actor: actor.name,
  });
}
