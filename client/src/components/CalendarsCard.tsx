import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus, Trash2, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useInvalidatingMutation, useHousehold } from '@/lib/hooks';
import { Card, Button, Field, Input, IconButton, Select, CheckBox, PALETTE } from './ui';
import { Confirm } from './Sheet';
import { useToast } from './Toast';
import type { Calendar } from '@shared/types';

/** Household page section: the outgoing feed and the incoming Google / Apple / iCal calendars. */
export function CalendarsCard() {
  const toast = useToast();
  const { data: household } = useHousehold();
  const calsQ = useQuery({ queryKey: ['calendars'], queryFn: api.calendars });
  const feedQ = useQuery({ queryKey: ['calendar', 'feed-info'], queryFn: api.feedInfo });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [feedMember, setFeedMember] = useState<number | ''>('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<Calendar | null>(null);
  const [error, setError] = useState('');

  const add = useInvalidatingMutation(() => api.createCalendar({ name: name.trim(), url: url.trim(), color: PALETTE[(calsQ.data?.length ?? 0) % PALETTE.length] }), ['calendars', 'calendar']);
  const toggle = useInvalidatingMutation((c: Calendar) => api.updateCalendar(c.id, { enabled: !c.enabled }), ['calendars', 'calendar']);
  const remove = useInvalidatingMutation((id: number) => api.deleteCalendar(id), ['calendars', 'calendar']);
  const rotate = useInvalidatingMutation(() => api.rotateFeedToken(), ['calendar']);

  const feedUrl = feedQ.data ? `${window.location.origin}${feedQ.data.path}?token=${feedQ.data.token}${feedMember ? `&member=${feedMember}` : ''}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Select the address and copy it manually');
    }
  };

  return (
    <>
      <Card title="Calendars" icon={CalendarDays}>
        <div className="stack" style={{ gap: 18 }}>
          <div>
            <b style={{ fontSize: 14 }}>Show Lar in Google or Apple Calendar</b>
            <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 8px' }}>
              Subscribe to this address and due dates, milestones, and project targets appear in your calendar. Google: Other calendars → From URL. Apple: File → New Calendar Subscription.
            </p>
            <div className="row" style={{ marginBottom: 8 }}>
              <Select value={feedMember} onChange={(e) => setFeedMember(e.target.value ? Number(e.target.value) : '')} style={{ width: 'auto' }} aria-label="Whose items">
                <option value="">Everyone's items</option>
                {household?.members.map((m) => (
                  <option key={m.id} value={m.id}>Only {m.name}'s</option>
                ))}
              </Select>
            </div>
            <div className="row">
              <code className="mono grow" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, wordBreak: 'break-all', fontSize: 12 }}>{feedUrl || '…'}</code>
              <IconButton icon={copied ? Check : Copy} label="Copy address" onClick={copy} />
              <IconButton icon={RefreshCw} label="Make a new address (old one stops working)" onClick={async () => { await rotate.mutateAsync(undefined as never); toast('New feed address created'); }} />
            </div>
          </div>

          <div>
            <b style={{ fontSize: 14 }}>Show your calendars in Lar</b>
            <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 10px' }}>
              Paste a private iCal link. Google: calendar settings → “Secret address in iCal format”. Apple: iCloud.com → share calendar → public link. Events show on the Today page.
            </p>
            {calsQ.data?.length ? (
              <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
                {calsQ.data.map((c) => (
                  <div key={c.id} className="row" style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <CheckBox on={c.enabled} onToggle={() => toggle.mutate(c)} label={c.enabled ? 'Disable calendar' : 'Enable calendar'} />
                    <span className="dot" style={{ background: c.color, width: 10, height: 10, borderRadius: '50%' }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                      <div className="faint truncate" style={{ fontSize: 12 }}>{c.last_error ? <span className="error row" style={{ gap: 4 }}><AlertTriangle size={12} /> {c.last_error}</span> : c.url}</div>
                    </div>
                    <IconButton icon={Trash2} label="Remove calendar" danger onClick={() => setConfirm(c)} />
                  </div>
                ))}
              </div>
            ) : null}
            <form
              className="form"
              style={{ gap: 10 }}
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                try {
                  await add.mutateAsync(undefined as never);
                  setName('');
                  setUrl('');
                  toast('Calendar connected');
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <div className="form-grid">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family, Work, School" maxLength={60} /></Field>
                <Field label="iCal link"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" inputMode="url" /></Field>
              </div>
              {error && <p className="error">{error}</p>}
              <Button type="submit" icon={Plus} disabled={!name.trim() || !url.trim() || add.isPending} style={{ alignSelf: 'flex-start' }}>
                {add.isPending ? 'Checking…' : 'Connect calendar'}
              </Button>
            </form>
          </div>
        </div>
      </Card>
      <Confirm open={confirm !== null} onClose={() => setConfirm(null)} title={`Remove ${confirm?.name}?`} body="Lar stops showing its events. Nothing changes in the calendar itself." confirmLabel="Remove" onConfirm={() => confirm && remove.mutate(confirm.id)} />
    </>
  );
}
