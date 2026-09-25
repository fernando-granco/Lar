import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, MapPin, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { dayHeading, today, addDays } from '@/lib/format';
import { Card, Empty } from './ui';
import type { CalendarEvent } from '@shared/types';

/** Upcoming events from connected Google / Apple / iCal calendars, grouped by day. */
export function CalendarCard({ days = 7 }: { days?: number }) {
  const calsQ = useQuery({ queryKey: ['calendars'], queryFn: api.calendars, staleTime: 60_000 });
  const evQ = useQuery({ queryKey: ['calendar', 'events', days], queryFn: () => api.calendarEvents(days), staleTime: 5 * 60_000, enabled: (calsQ.data?.length ?? 0) > 0 });

  const grouped = useMemo(() => {
    const t = today();
    const map = new Map<string, CalendarEvent[]>();
    for (const e of evQ.data?.events ?? []) {
      // Multi-day all-day events appear on each day they cover (end is exclusive).
      if (e.all_day) {
        for (let d = e.start; d < e.end && d <= addDays(t, days); d = addDays(d, 1)) {
          if (d < t) continue;
          map.set(d, [...(map.get(d) ?? []), e]);
        }
      } else {
        const d = localDate(e.start);
        if (d < t) continue;
        map.set(d, [...(map.get(d) ?? []), e]);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [evQ.data, days]);

  if (!calsQ.data?.length) return null;
  const failing = calsQ.data.filter((c) => c.enabled && c.last_error);

  return (
    <Card title="Calendar" icon={CalendarDays} flush action={<Link to="/settings?section=connections" className="btn btn-ghost btn-sm" aria-label="Calendar settings"><Settings /></Link>}>
      {failing.length > 0 && (
        <p className="error" style={{ padding: '4px 20px 8px', fontSize: 13 }}>
          Could not read {failing.map((c) => c.name).join(', ')}. Check the link in Settings → Connections.
        </p>
      )}
      {evQ.isLoading ? null : grouped.length ? (
        <div className="list">
          {grouped.map(([day, events]) => (
            <div key={day} className="list-section">
              <header className={day === today() ? 'today' : ''}>{dayHeading(day)}</header>
              {events.map((e, i) => (
                <div key={`${e.calendar_id}-${e.start}-${i}`} className="rowitem" style={{ cursor: 'default' }}>
                  <span className="dot" style={{ background: e.color, marginTop: 7 }} />
                  <div className="body">
                    <div className="title">{e.title}</div>
                    <div className="meta">
                      <span className="row" style={{ gap: 4 }}>
                        <Clock /> {e.all_day ? 'All day' : timeRange(e)}
                      </span>
                      {e.location && (
                        <span className="row truncate" style={{ gap: 4, maxWidth: 220 }}>
                          <MapPin /> {e.location}
                        </span>
                      )}
                      <span className="faint">{e.calendar}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={CalendarDays} title={`Nothing on the calendar for the next ${days} days`} />
      )}
    </Card>
  );
}

function localDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeRange(e: CalendarEvent) {
  const f = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${f(e.start)} – ${f(e.end)}`;
}
