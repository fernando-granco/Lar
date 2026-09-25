/**
 * Small admin CLI, run inside the container:
 *   docker exec lar node dist/server/cli.js reset-password Alex
 *   docker exec lar node dist/server/cli.js list-members
 */
import { db } from './db.js';
import { revokeUnlocks } from './auth.js';

const [cmd, ...args] = process.argv.slice(2);

function findMember(ref: string) {
  const byId = /^\d+$/.test(ref) ? (db.prepare('SELECT id, name FROM members WHERE id = ?').get(Number(ref)) as any) : undefined;
  const row = byId ?? (db.prepare('SELECT id, name FROM members WHERE lower(name) = lower(?)').get(ref) as any);
  if (!row) {
    console.error(`No member called "${ref}". Try list-members.`);
    process.exit(1);
  }
  return row as { id: number; name: string };
}

switch (cmd) {
  case 'list-members': {
    const rows = db.prepare('SELECT id, name, email, (password_hash IS NOT NULL) AS protected FROM members ORDER BY sort_order, id').all() as any[];
    for (const r of rows) console.log(`${r.id}\t${r.name}\t${r.email ?? '-'}\t${r.protected ? 'password' : 'open'}`);
    break;
  }
  case 'reset-password': {
    if (!args[0]) {
      console.error('Usage: reset-password <name or id>');
      process.exit(1);
    }
    const m = findMember(args[0]);
    db.prepare('UPDATE members SET password_hash = NULL WHERE id = ?').run(m.id);
    revokeUnlocks(m.id);
    console.log(`Password removed for ${m.name}. They can set a new one in Settings → People.`);
    break;
  }
  default:
    console.log('Commands:\n  list-members\n  reset-password <name or id>');
    process.exit(cmd ? 1 : 0);
}
