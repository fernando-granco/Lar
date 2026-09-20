// Types shared between the server and the client. Keep this file free of runtime imports.

export type ProjectStatus = 'idea' | 'planned' | 'active' | 'on_hold' | 'done';
export type ProjectPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'open' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ShoppingPriority = TaskPriority;
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number; // every N units, default 1
  weekdays?: number[]; // 0 = Sunday .. 6 = Saturday, for weekly
}

export interface Member {
  id: number;
  name: string;
  color: string;
  initials: string;
  sort_order: number;
  archived: boolean;
  email: string | null;
  is_kid: boolean;
  /** True when this person set a profile password. Devices must unlock them once. */
  has_password: boolean;
}

export interface Group {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  member_ids: number[];
}

export interface Settings {
  household_name: string;
  currency: string;
  week_starts_on: 'monday' | 'sunday';
  /** Let the server fetch calendars on private network addresses (e.g. a local Nextcloud). */
  allow_private_calendar_urls: boolean;
  /** True when Cloudflare Access sign-in is configured on the server. */
  access_sign_in: boolean;
  /** Recipes and the weekly menu are hidden until the household enables them. */
  recipes_enabled: boolean;
}

export interface Household {
  settings: Settings;
  members: Member[];
  groups: Group[];
}

/** Who something is for. Empty member_ids and group_ids means everyone. */
export interface Assignees {
  member_ids: number[];
  group_ids: number[];
}

export interface Task {
  id: number;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  recurrence: Recurrence | null;
  project_id: number | null;
  milestone_id: number | null;
  sort_order: number;
  created_by: number | null;
  completed_by: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignees: Assignees;
}

export interface ShoppingList {
  id: number;
  name: string;
  project_id: number | null;
  sort_order: number;
  open_count?: number;
}

export interface ShoppingItem {
  id: number;
  list_id: number;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  notes: string;
  price: number | null;
  priority: ShoppingPriority;
  checked_at: string | null;
  checked_by: number | null;
  sort_order: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  assignees: Assignees;
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  description: string;
  due_date: string | null;
  done_at: string | null;
  sort_order: number;
}

export interface Expense {
  id: number;
  project_id: number;
  title: string;
  amount: number;
  date: string;
  category: string;
  notes: string;
  shopping_item_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface ProjectLink {
  id: number;
  project_id: number;
  label: string;
  url: string;
  sort_order: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  color: string;
  icon: string;
  owner_id: number | null;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  budget: number | null;
  notes: string;
  sort_order: number;
  archived: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  member_ids: number[];
  // Derived summary
  task_count: number;
  task_done_count: number;
  milestone_count: number;
  milestone_done_count: number;
  spent: number;
  shopping_open_count: number;
  next_milestone: { id: number; title: string; due_date: string | null } | null;
}

export interface ProjectDetail extends Project {
  milestones: Milestone[];
  tasks: Task[];
  shopping_list: ShoppingList;
  shopping_items: ShoppingItem[];
  expenses: Expense[];
  links: ProjectLink[];
}

export interface Activity {
  id: number;
  actor_type: 'member' | 'agent' | 'system';
  actor_id: number | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  data: unknown;
  created_at: string;
}

export interface Summary {
  tasks_open: number;
  tasks_due_today: number;
  tasks_overdue: number;
  shopping_open: number;
  projects_active: number;
}

/** Server-sent event payload. */
export interface ChangeEvent {
  entity: 'household' | 'task' | 'shopping' | 'project' | 'recipe' | 'menu' | 'activity';
  id?: number;
  action: 'created' | 'updated' | 'deleted' | 'reordered';
  actor?: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  ingredients: string;
  instructions: string;
  prep_minutes: number | null;
  tags: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface MenuEntry {
  id: number;
  meal_date: string;
  meal_type: MealType;
  recipe_id: number | null;
  recipe_name: string | null;
  custom_title: string;
  notes: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Calendar {
  id: number;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
}

/** Everything with a date in a range: for the calendar page. */
export interface Agenda {
  from: string;
  to: string;
  tasks: Task[];
  milestones: { id: number; project_id: number; project_name: string; color: string; title: string; due_date: string; done: boolean }[];
  projects: { id: number; name: string; color: string; target_date: string; status: ProjectStatus }[];
  events: CalendarEvent[];
}

export interface CalendarEvent {
  calendar_id: number;
  calendar: string;
  color: string;
  title: string;
  start: string; // YYYY-MM-DD for all-day events, ISO datetime otherwise
  end: string;
  all_day: boolean;
  location?: string;
}
