import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation, type QueryKey } from '@tanstack/react-query';
import { api } from './api';
import { usePrefs } from './store';
import type { ChangeEvent, Member, Group, Assignees, KidPermission } from '@shared/types';

export const keys = {
  household: ['household'] as QueryKey,
  summary: ['summary'] as QueryKey,
  tasks: (p: object = {}) => ['tasks', p] as QueryKey,
  shoppingLists: ['shopping', 'lists'] as QueryKey,
  shoppingItems: (p: object = {}) => ['shopping', 'items', p] as QueryKey,
  projects: (p: object = {}) => ['projects', p] as QueryKey,
  project: (id: number) => ['project', id] as QueryKey,
  activity: (p: object = {}) => ['activity', p] as QueryKey,
  recipes: (p: object = {}) => ['recipes', p] as QueryKey,
  menu: (p: object = {}) => ['menu', p] as QueryKey,
  menuRules: (recipeId: number) => ['menu-rules', recipeId] as QueryKey,
  todayNotes: ['notes', 'today'] as QueryKey,
};

/** Other parts of the app (notifications) can listen to the same live change stream. */
const changeListeners = new Set<(ev: ChangeEvent) => void>();
export function onServerChange(fn: (ev: ChangeEvent) => void) {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

export function useHousehold() {
  return useQuery({ queryKey: keys.household, queryFn: api.household, staleTime: 60_000 });
}

/** The member chosen on this device, or null. */
export function useCurrentMember(): Member | null {
  const { memberId } = usePrefs();
  const { data } = useHousehold();
  return useMemo(() => data?.members.find((m) => m.id === memberId) ?? null, [data, memberId]);
}

/**
 * What the person on this device may change. Mirrors the server's rules so the
 * app can hide buttons that would only be refused; the server still decides.
 */
export function usePermissions() {
  const me = useCurrentMember();
  const { data } = useHousehold();
  return useMemo(() => {
    const isKid = !!me?.is_kid;
    const allowed = data?.settings.kid_permissions;
    return {
      isKid,
      isAdult: !!me && !isKid,
      /** May change something in this area that `createdBy` created (pass undefined for shared things). */
      can: (area: KidPermission, createdBy?: number | null) => !isKid || (createdBy != null && createdBy === me?.id) || !!allowed?.[area],
    };
  }, [me, data]);
}

export function useSummary() {
  return useQuery({ queryKey: keys.summary, queryFn: api.summary });
}

/** Keep every screen fresh: when the server reports a change, refetch the affected queries. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer: number | undefined;
    const connect = () => {
      es = new EventSource('/api/v1/events');
      es.addEventListener('change', (e) => {
        retry = 0;
        const ev = JSON.parse((e as MessageEvent).data) as ChangeEvent;
        changeListeners.forEach((fn) => fn(ev));
        qc.invalidateQueries({ queryKey: keys.summary });
        qc.invalidateQueries({ queryKey: ['activity'] });
        if (ev.entity === 'household') qc.invalidateQueries({ queryKey: keys.household });
        if (ev.entity === 'task') {
          qc.invalidateQueries({ queryKey: ['tasks'] });
          qc.invalidateQueries({ queryKey: ['project'] });
          qc.invalidateQueries({ queryKey: ['projects'] });
        }
        if (ev.entity === 'shopping') {
          qc.invalidateQueries({ queryKey: ['shopping'] });
          qc.invalidateQueries({ queryKey: ['project'] });
          qc.invalidateQueries({ queryKey: ['projects'] });
        }
        if (ev.entity === 'project') {
          qc.invalidateQueries({ queryKey: ['projects'] });
          qc.invalidateQueries({ queryKey: ['project'] });
          qc.invalidateQueries({ queryKey: ['shopping'] });
          qc.invalidateQueries({ queryKey: ['tasks'] });
          qc.invalidateQueries({ queryKey: ['notes'] });
        }
        if (ev.entity === 'recipe') qc.invalidateQueries({ queryKey: ['recipes'] });
        if (ev.entity === 'menu') { qc.invalidateQueries({ queryKey: ['menu'] }); qc.invalidateQueries({ queryKey: ['menu-rules'] }); }
      });
      es.onerror = () => {
        es?.close();
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') qc.invalidateQueries();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es?.close();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [qc]);
}

/** A mutation that invalidates the given query prefixes when it settles. */
export function useInvalidatingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, prefixes: string[], opts: { inlineErrors?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { inlineErrors: !!opts.inlineErrors },
    onSettled: () => prefixes.forEach((p) => qc.invalidateQueries({ queryKey: [p] })),
  });
}

/** Resolve assignees to display: members and groups, in household order. */
export function describeAssignees(a: Assignees, members: Member[], groups: Group[]) {
  const ms = members.filter((m) => a.member_ids.includes(m.id));
  const gs = groups.filter((g) => a.group_ids.includes(g.id));
  return { members: ms, groups: gs, everyone: ms.length === 0 && gs.length === 0 };
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 720px)');
}

export function useMediaQuery(q: string) {
  const mq = useMemo(() => window.matchMedia(q), [q]);
  const [matches, set] = useState(mq.matches);
  useEffect(() => {
    const fn = () => set(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [mq, set]);
  return matches;
}
