import { useSyncExternalStore } from 'react';

/**
 * Tiny per-device preferences store backed by localStorage.
 * Lar has no accounts: "who am I" is a remembered choice on this device, plus an unlock token when that person set a password.
 */
type Prefs = {
  memberId: number | null;
  /** Token proving this device unlocked a password-protected person. */
  unlockToken: string | null;
  theme: 'system' | 'light' | 'dark';
  view: 'mine' | 'everyone';
  projectsView: 'mine' | 'everyone';
};

const KEY = 'lar.prefs';
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { memberId: null, unlockToken: null, theme: 'system', view: 'everyone', projectsView: 'mine', ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { memberId: null, unlockToken: null, theme: 'system', view: 'everyone', projectsView: 'mine' };
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
