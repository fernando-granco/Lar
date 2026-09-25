-- Opt-in agent access, soft due dates, multiple project notes, and kid permissions.

-- Agents (MCP) and scripts that identify as agents are now opt-in. A household
-- that already exists keeps them on so its agents keep working after the update;
-- a fresh install starts with them off.
INSERT OR IGNORE INTO settings (key, value)
  SELECT 'agent_access', CASE WHEN EXISTS (SELECT 1 FROM members) THEN '1' ELSE '0' END;

-- What kids may change beyond their own things. Adults switch these on.
INSERT OR IGNORE INTO settings (key, value) VALUES ('kids_can_todos', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('kids_can_shopping', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('kids_can_projects', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('kids_can_recipes', '0');

-- "This week", "next month": a to-do can be due in a window instead of on a day.
ALTER TABLE tasks ADD COLUMN due_window TEXT CHECK (due_window IN ('week', 'month'));
ALTER TABLE tasks ADD COLUMN due_window_start TEXT;

-- A project can hold many notes, each with its own visibility and placement.
CREATE TABLE project_notes (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  show_on_overview INTEGER NOT NULL DEFAULT 1,
  show_on_today INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_project_notes_project ON project_notes(project_id, sort_order);

-- Who can see a note. No rows means everyone.
CREATE TABLE project_note_members (
  note_id INTEGER NOT NULL REFERENCES project_notes(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, member_id)
);

-- The old single notes field becomes each project's first note.
INSERT INTO project_notes (project_id, title, body, created_by, created_at, updated_at)
  SELECT id, 'Notes', notes, created_by, created_at, updated_at FROM projects WHERE trim(notes) <> '';
UPDATE projects SET notes = '' WHERE trim(notes) <> '';
