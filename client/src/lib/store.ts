import { useSyncExternalStore } from 'react';

/**
 * Tiny per-device preferences store backed by localStorage.
 * Homebase has no logins: "who am I" is just a remembered choice on this device.
 */
type Prefs = {
  memberId: number | null;
  theme: 'system' | 'light' | 'dark';
  view: 'mine' | 'everyone';
};

const KEY = 'homebase.prefs';
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { memberId: null, theme: 'system', view: 'everyone', ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { memberId: null, theme: 'system', view: 'everyone' };
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

export function applyTheme(theme: Prefs['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
applyTheme(state.theme);
