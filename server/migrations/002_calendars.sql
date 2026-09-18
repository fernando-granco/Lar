-- External calendars (Google, Apple, anything with a private iCal link) shown on the Today page.
CREATE TABLE calendars (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3f6f9e',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- A private token for the outgoing feed so it cannot be guessed on shared networks.
INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_token', lower(hex(randomblob(12))));
