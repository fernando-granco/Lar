import { useSyncExternalStore } from 'react';

/**
 * Tiny per-device preferences store backed by localStorage.
 * Lar has no accounts: "who am I" is a remembered choice on this device, plus an unlock token when that person set a password.
 */
export type DashboardSection = 'todos' | 'shopping' | 'calendar' | 'menu' | 'notes' | 'projects';
export type CompletionMode = 'instant' | 'delay' | 'screen';
export type TextSize = 'standard' | 'large' | 'extra-large' | 'huge';
export type Palette = 'classic' | 'ocean' | 'berry' | 'sunset' | 'forest' | 'slate' | 'custom';
export type Corners = 'rounded' | 'soft' | 'square';
export type HeadingFont = 'serif' | 'sans';
export type ProjectOverviewSection = 'details' | 'milestones' | 'todos' | 'shopping' | 'budget' | 'notes';
export type ProjectOverviewWidth = 'half' | 'full';
export type ProjectOverviewDensity = 'compact' | 'comfortable';

/** Which reminders this device shows. Everything is off until notifications are turned on. */
export type NotifyPrefs = {
  /** A morning summary of what is due today and overdue. */
  digest: boolean;
  digestTime: string;
  /** A reminder when a to-do with a time is coming up. */
  dueSoon: boolean;
  /** Minutes before the time. */
  dueLead: number;
  /** Someone else added a to-do for you. */
  assigned: boolean;
  /** Someone else added to the shopping list. */
  shopping: boolean;
  /** Milestones reached and projects finished, in projects you are part of. */
  projects: boolean;
  /** For assigned and shopping: only things that are for you personally, not for everyone. */
  onlyMine: boolean;
  /** No notifications between these times (HH:MM). Empty turns quiet hours off. */
  quietStart: string;
  quietEnd: string;
};

type Prefs = {
  memberId: number | null;
  /** Token proving this device unlocked a password-protected person. */
  unlockToken: string | null;
  theme: 'system' | 'light' | 'dark';
  palette: Palette;
  customPrimary: string;
  customAccent: string;
  corners: Corners;
  headingFont: HeadingFont;
  largeTargets: boolean;
  notificationsEnabled: boolean;
  notify: NotifyPrefs;
  view: 'mine' | 'everyone';
  projectsView: 'mine' | 'everyone';
  dashboardOrder: DashboardSection[];
  dashboardHidden: DashboardSection[];
  /** How many to-dos the Today card lists before "and N more". */
  dashboardTodoLimit: number;
  /** Also list to-dos without a date on the Today card, after dated ones. */
  dashboardTodoUndated: boolean;
  textSize: TextSize;
  completionMode: CompletionMode;
  completionDelaySeconds: number;
  projectOverviewOrder: ProjectOverviewSection[];
  projectOverviewHidden: ProjectOverviewSection[];
  projectOverviewWidths: Record<ProjectOverviewSection, ProjectOverviewWidth>;
  projectOverviewDensity: ProjectOverviewDensity;
};

const KEY = 'lar.prefs';
const listeners = new Set<() => void>();

const DASHBOARD: DashboardSection[] = ['todos', 'shopping', 'calendar', 'menu', 'notes', 'projects'];
const PALETTES: Palette[] = ['classic', 'ocean', 'berry', 'sunset', 'forest', 'slate', 'custom'];
const HEX = /^#[0-9a-f]{6}$/i;
const TIME = /^\d{2}:\d{2}$/;

export const DEFAULT_NOTIFY: NotifyPrefs = {
  digest: true,
  digestTime: '08:00',
  dueSoon: true,
  dueLead: 15,
  assigned: true,
  shopping: false,
  projects: false,
  onlyMine: true,
  quietStart: '21:30',
  quietEnd: '07:00',
};

const DEFAULTS: Prefs = {
  memberId: null,
  unlockToken: null,
  theme: 'system',
  palette: 'classic',
  customPrimary: '#345a51',
  customAccent: '#db744f',
  corners: 'rounded',
  headingFont: 'serif',
  largeTargets: false,
  notificationsEnabled: false,
  notify: DEFAULT_NOTIFY,
  view: 'everyone',
  projectsView: 'mine',
  dashboardOrder: DASHBOARD,
  dashboardHidden: ['menu'],
  dashboardTodoLimit: 10,
  dashboardTodoUndated: true,
  textSize: 'standard',
  completionMode: 'screen',
  completionDelaySeconds: 10,
  projectOverviewOrder: ['details', 'milestones', 'todos', 'shopping', 'budget', 'notes'],
  projectOverviewHidden: [],
  projectOverviewWidths: { details: 'half', milestones: 'half', todos: 'full', shopping: 'full', budget: 'half', notes: 'half' },
  projectOverviewDensity: 'comfortable',
};

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      const parsed = { ...DEFAULTS, ...stored } as Prefs;
      const known = Array.isArray(stored.dashboardOrder) ? (stored.dashboardOrder as DashboardSection[]) : [];
      // Sections added in newer versions join the saved order; notes slot in just before projects.
      const added = DASHBOARD.filter((x) => !known.includes(x));
      parsed.dashboardOrder = [...new Set([...known.filter((x) => DASHBOARD.includes(x)), ...added])];
      if (known.length && added.includes('notes')) {
        parsed.dashboardOrder = [...parsed.dashboardOrder.filter((x) => x !== 'notes' && x !== 'projects'), 'notes', ...(parsed.dashboardOrder.includes('projects') ? ['projects' as const] : [])];
      }
      parsed.dashboardHidden = (Array.isArray(parsed.dashboardHidden) ? parsed.dashboardHidden : []).filter((x): x is DashboardSection => DASHBOARD.includes(x as DashboardSection));
      const projectValid: ProjectOverviewSection[] = ['details', 'milestones', 'todos', 'shopping', 'budget', 'notes'];
      parsed.projectOverviewOrder = [...new Set([...(Array.isArray(parsed.projectOverviewOrder) ? parsed.projectOverviewOrder : []), ...projectValid])].filter((x): x is ProjectOverviewSection => projectValid.includes(x as ProjectOverviewSection));
      parsed.projectOverviewHidden = (Array.isArray(parsed.projectOverviewHidden) ? parsed.projectOverviewHidden : []).filter((x): x is ProjectOverviewSection => projectValid.includes(x as ProjectOverviewSection));
      parsed.projectOverviewWidths = Object.fromEntries(projectValid.map((key) => {
        const width = parsed.projectOverviewWidths?.[key];
        return [key, width === 'half' || width === 'full' ? width : DEFAULTS.projectOverviewWidths[key]];
      })) as Record<ProjectOverviewSection, ProjectOverviewWidth>;
      parsed.projectOverviewDensity = parsed.projectOverviewDensity === 'compact' ? 'compact' : 'comfortable';
      parsed.palette = PALETTES.includes(parsed.palette) ? parsed.palette : 'classic';
      parsed.customPrimary = HEX.test(parsed.customPrimary) ? parsed.customPrimary : DEFAULTS.customPrimary;
      parsed.customAccent = HEX.test(parsed.customAccent) ? parsed.customAccent : DEFAULTS.customAccent;
      parsed.corners = (['rounded', 'soft', 'square'] as Corners[]).includes(parsed.corners) ? parsed.corners : 'rounded';
      parsed.headingFont = parsed.headingFont === 'sans' ? 'sans' : 'serif';
      parsed.largeTargets = Boolean(parsed.largeTargets);
      parsed.notificationsEnabled = Boolean(parsed.notificationsEnabled);
      const n = { ...DEFAULT_NOTIFY, ...(typeof stored.notify === 'object' && stored.notify ? stored.notify : {}) } as NotifyPrefs;
      n.digestTime = TIME.test(n.digestTime) ? n.digestTime : DEFAULT_NOTIFY.digestTime;
      n.quietStart = n.quietStart === '' || TIME.test(n.quietStart) ? n.quietStart : DEFAULT_NOTIFY.quietStart;
      n.quietEnd = n.quietEnd === '' || TIME.test(n.quietEnd) ? n.quietEnd : DEFAULT_NOTIFY.quietEnd;
      n.dueLead = Math.min(240, Math.max(0, Number(n.dueLead) || 0));
      parsed.notify = n;
      parsed.dashboardTodoLimit = Math.min(100, Math.max(3, Number(parsed.dashboardTodoLimit) || DEFAULTS.dashboardTodoLimit));
      parsed.dashboardTodoUndated = parsed.dashboardTodoUndated !== false;
      parsed.completionDelaySeconds = Math.min(3600, Math.max(1, Number(parsed.completionDelaySeconds) || 10));
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

let state: Prefs = read();

function write(next: Partial<Prefs>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePrefs() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const setPrefs = write;
export const getPrefs = () => state;
export const setNotify = (patch: Partial<NotifyPrefs>) => write({ notify: { ...state.notify, ...patch } });
export const getCurrentMemberId = () => state.memberId;
export const getUnlockToken = () => state.unlockToken;
/** Forget the chosen person on this device (e.g. after the server refused a locked profile). */
export const clearMember = () => write({ memberId: null, unlockToken: null });

export function applyTheme(theme: Prefs['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
applyTheme(state.theme);

/** Palettes set their colors in CSS for light and dark; a custom palette passes its two colors in. */
export function applyPalette(palette: Palette, custom: { primary: string; accent: string } = { primary: state.customPrimary, accent: state.customAccent }) {
  const root = document.documentElement;
  root.setAttribute('data-palette', palette);
  if (palette === 'custom') {
    root.style.setProperty('--custom-primary', custom.primary);
    root.style.setProperty('--custom-accent', custom.accent);
    // Light colors need dark text on buttons to stay readable.
    root.style.setProperty('--custom-ink', luminance(custom.primary) > 0.22 ? '#111210' : '#ffffff');
  } else {
    root.style.removeProperty('--custom-primary');
    root.style.removeProperty('--custom-accent');
    root.style.removeProperty('--custom-ink');
  }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
applyPalette(state.palette);

export function applyCorners(corners: Corners) {
  document.documentElement.setAttribute('data-corners', corners);
}
applyCorners(state.corners);

export function applyHeadingFont(font: HeadingFont) {
  document.documentElement.setAttribute('data-headings', font);
}
applyHeadingFont(state.headingFont);

export function applyTextSize(size: TextSize) {
  document.documentElement.setAttribute('data-text-size', size);
}
applyTextSize(state.textSize);

export function applyLargeTargets(enabled: boolean) {
  document.documentElement.toggleAttribute('data-large-targets', enabled);
}
applyLargeTargets(state.largeTargets);
