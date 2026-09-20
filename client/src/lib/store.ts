import { useSyncExternalStore } from 'react';

/**
 * Tiny per-device preferences store backed by localStorage.
 * Lar has no accounts: "who am I" is a remembered choice on this device, plus an unlock token when that person set a password.
 */
export type DashboardSection = 'todos' | 'shopping' | 'calendar' | 'menu' | 'projects';
export type CompletionMode = 'instant' | 'delay' | 'screen';
export type TextSize = 'standard' | 'large' | 'extra-large';

type Prefs = {
  memberId: number | null;
  /** Token proving this device unlocked a password-protected person. */
  unlockToken: string | null;
  theme: 'system' | 'light' | 'dark';
  view: 'mine' | 'everyone';
  projectsView: 'mine' | 'everyone';
  dashboardOrder: DashboardSection[];
  textSize: TextSize;
  completionMode: CompletionMode;
  completionDelaySeconds: number;
};

const KEY = 'lar.prefs';
const listeners = new Set<() => void>();

const DEFAULTS: Prefs = {
  memberId: null,
  unlockToken: null,
  theme: 'system',
  view: 'everyone',
  projectsView: 'mine',
  dashboardOrder: ['todos', 'shopping', 'calendar', 'menu', 'projects'],
  textSize: 'standard',
  completionMode: 'screen',
  completionDelaySeconds: 10,
};

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as Prefs;
      const valid: DashboardSection[] = ['todos', 'shopping', 'calendar', 'menu', 'projects'];
      parsed.dashboardOrder = [...new Set([...(Array.isArray(parsed.dashboardOrder) ? parsed.dashboardOrder : []), ...valid])].filter((x): x is DashboardSection => valid.includes(x as DashboardSection));
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

export function applyTextSize(size: TextSize) {
  document.documentElement.setAttribute('data-text-size', size);
}
applyTextSize(state.textSize);
