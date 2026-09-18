import type {
  Household, Member, Group, Settings, Task, ShoppingList, ShoppingItem, Project, ProjectDetail,
  Milestone, Expense, ProjectLink, Activity, Summary, Assignees, Recurrence, Calendar, CalendarEvent,
} from '@shared/types';
import { getCurrentMemberId } from './store';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const member = getCurrentMemberId();
  if (member) headers['X-Lar-Member'] = String(member);
  const res = await fetch(`/api/v1${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText, data.details);
  return data as T;
}

const get = <T>(url: string) => request<T>('GET', url);
const post = <T>(url: string, body?: unknown) => request<T>('POST', url, body);
const patch = <T>(url: string, body: unknown) => request<T>('PATCH', url, body);
const del = (url: string) => request<void>('DELETE', url);

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export type TaskInput = Partial<{
  title: string; notes: string; priority: Task['priority']; due_date: string | null; due_time: string | null;
  recurrence: Recurrence | null; project_id: number | null; milestone_id: number | null; assignees: Assignees; status: Task['status'];
}>;
export type ShoppingItemInput = Partial<{
  list_id: number; name: string; quantity: number | null; unit: string; category: string; notes: string; price: number | null; assignees: Assignees; checked: boolean;
}>;
export type ProjectInput = Partial<{
  name: string; description: string; status: Project['status']; priority: Project['priority']; color: string; icon: string;
  owner_id: number | null; member_ids: number[]; start_date: string | null; target_date: string | null; budget: number | null; notes: string; archived: boolean;
}>;
export type MilestoneInput = Partial<{ title: string; description: string; due_date: string | null; done: boolean; sort_order: number }>;
export type ExpenseInput = Partial<{ title: string; amount: number; date: string; category: string; notes: string; shopping_item_id: number | null }>;

export const api = {
  household: () => get<Household>('/household'),
  updateSettings: (s: Partial<Settings>) => patch<Settings>('/household/settings', s),
  createMember: (m: { name: string; color?: string; initials?: string }) => post<Member>('/members', m),
  updateMember: (id: number, m: Partial<Member>) => patch<Member>(`/members/${id}`, m),
  deleteMember: (id: number) => del(`/members/${id}`),
  createGroup: (g: { name: string; color?: string; member_ids?: number[] }) => post<Group>('/groups', g),
  updateGroup: (id: number, g: Partial<Pick<Group, 'name' | 'color' | 'member_ids'>>) => patch<Group>(`/groups/${id}`, g),
  deleteGroup: (id: number) => del(`/groups/${id}`),

  tasks: (p: { status?: 'open' | 'done' | 'all'; project?: number | 'none' | 'any'; member?: number; due?: string; q?: string; limit?: number } = {}) =>
    get<Task[]>(`/tasks${qs(p)}`),
  createTask: (t: TaskInput & { title: string }) => post<Task>('/tasks', t),
  updateTask: (id: number, t: TaskInput) => patch<Task>(`/tasks/${id}`, t),
  completeTask: (id: number) => post<Task>(`/tasks/${id}/complete`),
  reopenTask: (id: number) => post<Task>(`/tasks/${id}/reopen`),
  deleteTask: (id: number) => del(`/tasks/${id}`),
  clearCompletedTasks: (project?: number) => post<{ deleted: number }>('/tasks/clear-completed', project ? { project } : {}),

  shoppingLists: () => get<ShoppingList[]>('/shopping/lists'),
  createShoppingList: (name: string) => post<ShoppingList>('/shopping/lists', { name }),
  renameShoppingList: (id: number, name: string) => patch<ShoppingList>(`/shopping/lists/${id}`, { name }),
  deleteShoppingList: (id: number) => del(`/shopping/lists/${id}`),
  shoppingItems: (p: { list?: number; status?: 'open' | 'checked' | 'all'; member?: number; q?: string } = {}) => get<ShoppingItem[]>(`/shopping/items${qs(p)}`),
  createShoppingItem: (i: ShoppingItemInput & { name: string }) => post<ShoppingItem>('/shopping/items', i),
  updateShoppingItem: (id: number, i: ShoppingItemInput) => patch<ShoppingItem>(`/shopping/items/${id}`, i),
  checkShoppingItem: (id: number) => post<ShoppingItem>(`/shopping/items/${id}/check`),
  uncheckShoppingItem: (id: number) => post<ShoppingItem>(`/shopping/items/${id}/uncheck`),
  deleteShoppingItem: (id: number) => del(`/shopping/items/${id}`),
  clearChecked: (listId: number) => post<{ deleted: number }>(`/shopping/lists/${listId}/clear-checked`),
  shoppingSuggestions: (q?: string) => get<{ name: string; category: string; unit: string; times: number }[]>(`/shopping/suggestions${qs({ q })}`),

  projects: (p: { status?: string; archived?: boolean; member?: number; q?: string } = {}) => get<Project[]>(`/projects${qs(p)}`),
  project: (id: number) => get<ProjectDetail>(`/projects/${id}`),
  createProject: (p: ProjectInput & { name: string }) => post<ProjectDetail>('/projects', p),
  updateProject: (id: number, p: ProjectInput) => patch<ProjectDetail>(`/projects/${id}`, p),
  deleteProject: (id: number) => del(`/projects/${id}`),
  createMilestone: (projectId: number, m: MilestoneInput & { title: string }) => post<Milestone>(`/projects/${projectId}/milestones`, m),
  updateMilestone: (id: number, m: MilestoneInput) => patch<Milestone>(`/milestones/${id}`, m),
  deleteMilestone: (id: number) => del(`/milestones/${id}`),
  createExpense: (projectId: number, e: ExpenseInput & { title: string; amount: number }) => post<Expense>(`/projects/${projectId}/expenses`, e),
  updateExpense: (id: number, e: ExpenseInput) => patch<Expense>(`/expenses/${id}`, e),
  deleteExpense: (id: number) => del(`/expenses/${id}`),
  createLink: (projectId: number, l: { label: string; url: string }) => post<ProjectLink>(`/projects/${projectId}/links`, l),
  deleteLink: (id: number) => del(`/links/${id}`),

  calendars: () => get<Calendar[]>('/calendars'),
  createCalendar: (c: { name: string; url: string; color?: string }) => post<Calendar>('/calendars', c),
  updateCalendar: (id: number, c: Partial<Pick<Calendar, 'name' | 'url' | 'color' | 'enabled'>>) => patch<Calendar>(`/calendars/${id}`, c),
  deleteCalendar: (id: number) => del(`/calendars/${id}`),
  calendarEvents: (days = 7) => get<{ today: string; events: CalendarEvent[] }>(`/calendar/events${qs({ days })}`),
  feedInfo: () => get<{ token: string; path: string }>('/calendar/feed-info'),
  rotateFeedToken: () => post<{ token: string; path: string }>('/calendar/feed-token/rotate'),

  summary: () => get<Summary>('/summary'),
  activity: (p: { limit?: number; entity?: string; entity_id?: number } = {}) => get<Activity[]>(`/activity${qs(p)}`),
};
