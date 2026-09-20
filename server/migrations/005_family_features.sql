-- Family usability features: kid profiles, shopping priority, and optional recipes/menu.

ALTER TABLE members ADD COLUMN is_kid INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shopping_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low','normal','high','urgent'));

INSERT OR IGNORE INTO settings (key, value) VALUES ('recipes_enabled', '0');

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  prep_minutes INTEGER,
  tags TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_recipes_name ON recipes(name COLLATE NOCASE);

CREATE TABLE weekly_menu (
  id INTEGER PRIMARY KEY,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner')),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  custom_title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (meal_date, meal_type),
  CHECK (recipe_id IS NOT NULL OR length(trim(custom_title)) > 0)
);
CREATE INDEX idx_weekly_menu_date ON weekly_menu(meal_date, meal_type);
