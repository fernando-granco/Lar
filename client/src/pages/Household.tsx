import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users, UserRound, Settings as SettingsIcon, Plug, Moon, Sun, Monitor } from 'lucide-react';
import { api } from '@/lib/api';
import { useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { usePrefs, setPrefs, applyTheme } from '@/lib/store';
import { Card, Button, Field, Input, Select, Avatar, IconButton, ColorDots, Chip, Segmented, Empty, PALETTE } from '@/components/ui';
import { Sheet, Confirm } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import type { Member, Group } from '@shared/types';
import { CalendarsCard } from '@/components/CalendarsCard';

export function Household() {
  const { data } = useHousehold();
  const toast = useToast();
  const prefs = usePrefs();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [week, setWeek] = useState<'monday' | 'sunday'>('monday');
  useEffect(() => {
    if (data) {
      setName(data.settings.household_name);
      setCurrency(data.settings.currency);
      setWeek(data.settings.week_starts_on);
    }
  }, [data]);
  const saveSettings = useInvalidatingMutation(() => api.updateSettings({ household_name: name.trim() || 'Homebase', currency: currency.trim().toUpperCase() || 'USD', week_starts_on: week }), ['household']);

  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [groupSheet, setGroupSheet] = useState<Group | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'member' | 'group'; id: number; name: string } | null>(null);
  const deleteMember = useInvalidatingMutation((id: number) => api.deleteMember(id), ['household', 'tasks', 'shopping', 'projects']);
  const deleteGroup = useInvalidatingMutation((id: number) => api.deleteGroup(id), ['household', 'tasks', 'shopping']);

  const dirty = data && (name !== data.settings.household_name || currency !== data.settings.currency || week !== data.settings.week_starts_on);
  const origin = window.location.origin;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Household</h1>
          <p className="sub">The people, groups, and settings behind your Homebase.</p>
        </div>
      </header>

      <div className="grid-2">
        <Card title="People" icon={UserRound} flush action={<Button size="sm" icon={Plus} onClick={() => setMemberSheet('new')}>Add person</Button>}>
          <div className="list">
            {data?.members.map((m) => (
              <div key={m.id} className="rowitem" onClick={() => setMemberSheet(m)}>
                <Avatar member={m} size="lg" />
                <div className="body">
                  <div className="title">{m.name}</div>
                  <div className="meta">{m.id === prefs.memberId ? 'This device' : data.groups.filter((g) => g.member_ids.includes(m.id)).map((g) => g.name).join(', ')}</div>
                </div>
                <div className="side">
                  <IconButton icon={Pencil} label="Edit" onClick={(e) => { e.stopPropagation(); setMemberSheet(m); }} />
                  <IconButton icon={Trash2} label="Remove" danger onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'member', id: m.id, name: m.name }); }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Groups" icon={Users} flush action={<Button size="sm" icon={Plus} onClick={() => setGroupSheet('new')}>Add group</Button>}>
          {data?.groups.length ? (
            <div className="list">
              {data.groups.map((g) => (
                <div key={g.id} className="rowitem" onClick={() => setGroupSheet(g)}>
                  <Avatar member={{ name: g.name, color: g.color, initials: g.name.slice(0, 2).toUpperCase() }} size="lg" group />
                  <div className="body">
                    <div className="title">{g.name}</div>
                    <div className="meta">{g.member_ids.length ? data.members.filter((m) => g.member_ids.includes(m.id)).map((m) => m.name).join(', ') : 'No one yet'}</div>
                  </div>
                  <div className="side">
                    <IconButton icon={Pencil} label="Edit" onClick={(e) => { e.stopPropagation(); setGroupSheet(g); }} />
                    <IconButton icon={Trash2} label="Delete" danger onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'group', id: g.id, name: g.name }); }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Users} title="No groups yet" hint='Groups like "Kids" or "Adults" make assigning things quick.' />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Settings" icon={SettingsIcon}>
          <div className="form">
            <Field label="Household name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <div className="form-grid">
              <Field label="Currency" hint="ISO code">
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
              </Field>
              <Field label="Week starts on">
                <Select value={week} onChange={(e) => setWeek(e.target.value as 'monday' | 'sunday')}>
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </Select>
              </Field>
            </div>
            <Field label="Appearance" hint="this device">
              <Segmented<'system' | 'light' | 'dark'>
                value={prefs.theme}
                onChange={(theme) => { setPrefs({ theme }); applyTheme(theme); }}
                options={[
                  { value: 'system', label: <span className="row" style={{ gap: 5 }}><Monitor size={14} /> Auto</span> },
                  { value: 'light', label: <span className="row" style={{ gap: 5 }}><Sun size={14} /> Light</span> },
                  { value: 'dark', label: <span className="row" style={{ gap: 5 }}><Moon size={14} /> Dark</span> },
                ]}
              />
            </Field>
            <div className="row">
              <Button variant="primary" disabled={!dirty || saveSettings.isPending} onClick={async () => { await saveSettings.mutateAsync(undefined as never); toast('Settings saved'); }}>Save settings</Button>
            </div>
          </div>
        </Card>

        <Card title="Agents & API" icon={Plug}>
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <b style={{ fontSize: 14 }}>Let an agent use Homebase</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Homebase is an MCP server. Add this address to Hermes Agent, Claude, or any Model Context Protocol client and it can read and change to-dos, shopping, and projects by name.
              </p>
              <code className="mono" style={{ display: 'block', marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, wordBreak: 'break-all' }}>{origin}/mcp</code>
              <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Send an <code className="mono">X-Homebase-Agent</code> header with the agent's name so the activity log shows who did what.</p>
            </div>
            <div>
              <b style={{ fontSize: 14 }}>REST API for scripts</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Everything the app does is available as JSON. Open the address for a map of all routes.</p>
              <code className="mono" style={{ display: 'block', marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, wordBreak: 'break-all' }}>{origin}/api/v1</code>
            </div>
            <div>
              <b style={{ fontSize: 14 }}>Install on your phone</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Open this address in Safari or Chrome on your phone and choose “Add to Home Screen”. Homebase then opens like an app.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <CalendarsCard />

      <MemberSheet open={memberSheet !== null} member={memberSheet === 'new' ? null : memberSheet} onClose={() => setMemberSheet(null)} />
      <GroupSheet open={groupSheet !== null} group={groupSheet === 'new' ? null : groupSheet} members={data?.members ?? []} onClose={() => setGroupSheet(null)} />
      <Confirm
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'member' ? `Remove ${confirm.name}?` : `Delete group ${confirm?.name}?`}
        body={confirm?.kind === 'member' ? 'Things assigned only to them become “everyone”. Projects they own stay.' : 'Things assigned to this group become “everyone” unless people were also picked.'}
        confirmLabel={confirm?.kind === 'member' ? 'Remove' : 'Delete'}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === 'member') {
            await deleteMember.mutateAsync(confirm.id);
            if (prefs.memberId === confirm.id) setPrefs({ memberId: null });
          } else await deleteGroup.mutateAsync(confirm.id);
          toast(confirm.kind === 'member' ? 'Person removed' : 'Group deleted');
        }}
      />
    </div>
  );
}

function MemberSheet({ open, member, onClose }: { open: boolean; member: Member | null; onClose: () => void }) {
  const toast = useToast();
  const { data } = useHousehold();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const [initials, setInitials] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? '');
    setColor(member?.color ?? PALETTE[(data?.members.length ?? 0) % PALETTE.length]!);
    setInitials(member?.initials ?? '');
  }, [open, member, data?.members.length]);
  const save = useInvalidatingMutation(() => (member ? api.updateMember(member.id, { name: name.trim(), color, initials: initials.trim() || undefined }) : api.createMember({ name: name.trim(), color, initials: initials.trim() || undefined })), ['household']);
  return (
    <Sheet open={open} onClose={onClose} title={member ? 'Edit person' : 'Add a person'} footer={<Button variant="primary" className="right" disabled={!name.trim() || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast(member ? 'Saved' : `${name.trim()} added`); onClose(); }}>{member ? 'Save' : 'Add'}</Button>}>
      <div className="form">
        <div className="row">
          <Avatar member={{ name: name || '?', color, initials: initials || (name ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') : '?') }} size="lg" />
          <Field label="Name" className="grow">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Maria" />
          </Field>
        </div>
        <Field label="Color">
          <ColorDots value={color} onChange={setColor} />
        </Field>
        <Field label="Initials" hint="optional">
          <Input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} placeholder="Auto" style={{ width: 100 }} />
        </Field>
      </div>
    </Sheet>
  );
}

function GroupSheet({ open, group, members, onClose }: { open: boolean; group: Group | null; members: Member[]; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[2]!);
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setColor(group?.color ?? PALETTE[2]!);
    setIds(group?.member_ids ?? []);
  }, [open, group]);
  const save = useInvalidatingMutation(() => (group ? api.updateGroup(group.id, { name: name.trim(), color, member_ids: ids }) : api.createGroup({ name: name.trim(), color, member_ids: ids })), ['household']);
  return (
    <Sheet open={open} onClose={onClose} title={group ? 'Edit group' : 'New group'} footer={<Button variant="primary" className="right" disabled={!name.trim() || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast(group ? 'Saved' : 'Group created'); onClose(); }}>{group ? 'Save' : 'Create'}</Button>}>
      <div className="form">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Kids, Adults, Weekend crew" />
        </Field>
        <Field label="Members">
          <div className="chip-row">
            {members.map((m) => {
              const on = ids.includes(m.id);
              return (
                <Chip key={m.id} on={on} onClick={() => setIds(on ? ids.filter((x) => x !== m.id) : [...ids, m.id])}>
                  <Avatar member={m} size="sm" /> {m.name}
                </Chip>
              );
            })}
          </div>
        </Field>
        <Field label="Color">
          <ColorDots value={color} onChange={setColor} />
        </Field>
      </div>
    </Sheet>
  );
}
