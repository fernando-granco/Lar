import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallState = {
  canPrompt: boolean;
  installed: boolean;
  isIos: boolean;
  isSecure: boolean;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

let state: InstallState = {
  canPrompt: false,
  installed: standalone(),
  isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
  isSecure: window.isSecureContext,
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  state = { ...state, canPrompt: true };
  notify();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  state = { ...state, canPrompt: false, installed: true };
  notify();
});

export function usePwaInstall() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );

  return {
    ...current,
    install: async () => {
      if (!deferredPrompt) return false;
      const prompt = deferredPrompt;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        deferredPrompt = null;
        state = { ...state, canPrompt: false };
        notify();
        return true;
      }
      return false;
    },
  };
}
