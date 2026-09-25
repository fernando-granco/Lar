import { useEffect, useRef } from 'react';
import { api } from './api';
import { today, taskDueBy } from './format';
import { usePrefs, getPrefs, type NotifyPrefs } from './store';
import { onServerChange } from './hooks';
import type { Assignees, ChangeEvent, Household } from '@shared/types';

/**
 * Opt-in reminders while Lar is open (a tab, or the installed app in the
 * background). Browser permission is only ever requested from Settings.
 * Which kinds this device shows is up to the person, per device.
 */

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/** Browsers only allow notifications on https:// or localhost. */
export const notificationsNeedHttps = () => typeof window !== 'undefined' && !window.isSecureContext;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

export function inQuietHours(p: NotifyPrefs, now = new Date()) {
  if (!p.quietStart || !p.quietEnd || p.quietStart === p.quietEnd) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutes(p.quietStart);
  const b = minutes(p.quietEnd);
  return a < b ? t >= a && t < b : t >= a || t < b;
}

export function notify(title: string, body: string, tag?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' };
  // Installed apps on Android only show notifications through the service worker.
  navigator.serviceWorker?.getRegistration().then((reg) => {
    if (reg) return reg.showNotification(title, options);
    new Notification(title, options);
  }).catch(() => {
    try {
      new Notification(title, options);
    } catch {
      /* ignore */
    }
  });
}

/** Remember what was already shown today so a reload does not repeat it. */
function once(key: string) {
  const full = `lar-notified:${today()}:${key}`;
  try {
    if (localStorage.getItem(full)) return false;
    localStorage.setItem(full, '1');
    // Forget earlier days.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('lar-notified:') && !k.startsWith(`lar-notified:${today()}:`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage full or blocked: show it anyway */
  }
  return true;
}

function isForMe(a: Assignees, memberId: number, household: Household | undefined, includeEveryone: boolean) {
  if (!a.member_ids.length && !a.group_ids.length) return includeEveryone;
  if (a.member_ids.includes(memberId)) return true;
  return !!household?.groups.some((g) => a.group_ids.includes(g.id) && g.member_ids.includes(memberId));
}

export function useGentleNotifications(household: Household | undefined) {
  const { notificationsEnabled, memberId } = usePrefs();
  const householdRef = useRef(household);
  householdRef.current = household;

  // Time-based: the morning summary and reminders for to-dos with a time.
  useEffect(() => {
    if (!notificationsEnabled || !memberId || !notificationsSupported() || Notification.permission !== 'granted') return;
    const check = async () => {
      const p = getPrefs().notify;
      if (inQuietHours(p)) return;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (!p.digest && !p.dueSoon) return;
      const tasks = await api.tasks({ status: 'open', member: memberId }).catch(() => []);
      const t = today();
      if (p.digest && nowMin >= minutes(p.digestTime)) {
        const dueToday = tasks.filter((x) => x.due_date === t).length;
        const overdue = tasks.filter((x) => (taskDueBy(x) ?? '9999') < t).length;
        if ((dueToday || overdue) && once(`digest:${memberId}`)) {
          const parts = [dueToday && `${dueToday} to-do${dueToday === 1 ? '' : 's'} today`, overdue && `${overdue} overdue`].filter(Boolean);
          notify('Your day in Lar', `${parts.join(', ')}.`, 'lar-digest');
        }
      }
      if (p.dueSoon) {
        for (const task of tasks) {
          if (task.due_date !== t || !task.due_time) continue;
          const at = minutes(task.due_time);
          if (nowMin >= at - p.dueLead && nowMin <= at + 30 && once(`due:${task.id}:${task.due_time}`)) {
            notify(task.title, p.dueLead && nowMin < at ? `Due at ${task.due_time}` : 'Due now', `lar-task-${task.id}`);
          }
        }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [notificationsEnabled, memberId]);

  // Event-based: things other people do, arriving on the live change stream.
  useEffect(() => {
    if (!notificationsEnabled || !memberId || !notificationsSupported()) return;
    let shoppingBatch: { count: number; actor: string; timer: number } | null = null;
    const off = onServerChange(async (ev: ChangeEvent) => {
      const p = getPrefs().notify;
      if (Notification.permission !== 'granted' || inQuietHours(p)) return;
      if (ev.actor_type === 'member' && ev.actor_id === memberId) return; // your own changes
      const who = ev.actor || 'Someone';
      if (ev.entity === 'task' && ev.action === 'created' && p.assigned && ev.id) {
        const task = await api.task(ev.id).catch(() => null);
        if (!task || task.status !== 'open' || task.created_by === memberId) return;
        if (!isForMe(task.assignees, memberId, householdRef.current, !p.onlyMine)) return;
        notify(`${who} added a to-do${isForMe(task.assignees, memberId, householdRef.current, false) ? ' for you' : ''}`, task.title, `lar-task-${task.id}`);
      }
      if (ev.entity === 'shopping' && ev.action === 'created' && p.shopping && ev.id) {
        if (p.onlyMine) {
          const item = await api.shoppingItems({ status: 'open', member: memberId }).then((items) => items.find((i) => i.id === ev.id)).catch(() => undefined);
          if (!item || !isForMe(item.assignees, memberId, householdRef.current, false)) return;
        }
        // Several items added in a row become one notification.
        if (shoppingBatch) window.clearTimeout(shoppingBatch.timer);
        const count = (shoppingBatch?.count ?? 0) + 1;
        shoppingBatch = {
          count,
          actor: who,
          timer: window.setTimeout(() => {
            notify('Shopping list', count === 1 ? `${who}: ${ev.summary ?? 'added an item'}` : `${who} added ${count} items`, 'lar-shopping');
            shoppingBatch = null;
          }, 8000),
        };
      }
      if (ev.entity === 'project' && p.projects && ev.id && ev.summary && /^(Reached milestone|Moved .* to done)/.test(ev.summary)) {
        const mine = await api.projects({ status: 'all', member: memberId }).catch(() => []);
        if (!mine.some((x) => x.id === ev.id)) return;
        notify(mine.find((x) => x.id === ev.id)!.name, `${who}: ${ev.summary}`, `lar-project-${ev.id}`);
      }
    });
    return () => {
      off();
      if (shoppingBatch) window.clearTimeout(shoppingBatch.timer);
    };
  }, [notificationsEnabled, memberId]);
}
