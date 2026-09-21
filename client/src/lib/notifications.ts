import { useEffect } from 'react';
import { api } from './api';
import { today } from './format';
import { usePrefs } from './store';

/** Gentle, opt-in reminders while Lar is open. Browser notification permission is never requested automatically. */
export function useGentleNotifications() {
  const { notificationsEnabled, memberId } = usePrefs();
  useEffect(() => {
    if (!notificationsEnabled || !memberId || !('Notification' in window) || Notification.permission !== 'granted') return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const tasks = await api.tasks({ status: 'open', member: memberId, due: today() }).catch(() => []);
      const key = `lar-notified-${today()}-${memberId}`;
      if (tasks.length && !sessionStorage.getItem(key)) {
        new Notification('Lar reminder', { body: `${tasks.length} thing${tasks.length === 1 ? '' : 's'} need${tasks.length === 1 ? 's' : ''} your attention today.` });
        sessionStorage.setItem(key, '1');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [notificationsEnabled, memberId]);
}
