-- Household personalization, richer recipes, and reusable weekly-menu rules.

ALTER TABLE members ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'Lar');
INSERT OR IGNORE INTO settings (key, value) VALUES ('app_tagline', 'The family''s home hub');
UPDATE settings SET value = '1' WHERE key = 'recipes_enabled';

ALTER TABLE recipes ADD COLUMN servings INTEGER;
ALTER TABLE recipes ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN ingredient_rows TEXT NOT NULL DEFAULT '[]';

CREATE TABLE menu_rules (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner')),
  start_date TEXT NOT NULL,
  recurrence TEXT NOT NULL,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_menu_rules_recipe ON menu_rules(recipe_id);
