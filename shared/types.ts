// Types shared between the server and the client. Keep this file free of runtime imports.

export type ProjectStatus = 'idea' | 'planned' | 'active' | 'on_hold' | 'done';
export type ProjectPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'open' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
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
  entity: 'household' | 'task' | 'shopping' | 'project' | 'activity';
  id?: number;
  action: 'created' | 'updated' | 'deleted' | 'reordered';
  actor?: string;
}
