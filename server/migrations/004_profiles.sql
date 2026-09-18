-- Optional per-person protection and identity.
ALTER TABLE members ADD COLUMN email TEXT;
ALTER TABLE members ADD COLUMN password_hash TEXT;

-- Devices that have unlocked a protected person hold a token.
CREATE TABLE unlocks (
  token TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_private_calendar_urls', '0');
