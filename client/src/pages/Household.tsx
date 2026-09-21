import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users, UserRound, Settings as SettingsIcon, Plug, Moon, Sun, Monitor, Lock, ChevronUp, ChevronDown, Type, ListChecks, Baby, Eye, EyeOff, Activity as ActivityIcon, HardDrive, Bell, Code2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { usePrefs, setPrefs, applyTheme, applyTextSize, applyPalette, applyLargeTargets, type CompletionMode, type DashboardSection, type TextSize, type Palette } from '@/lib/store';
import { Card, Button, Field, Input, Select, Avatar, IconButton, ColorDots, Chip, Segmented, Empty, PALETTE } from '@/components/ui';
import { Sheet, Confirm } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import type { Member, Group } from '@shared/types';
import { CalendarsCard } from '@/components/CalendarsCard';
import { BackupCard } from '@/components/BackupCard';
import { InstallAppCard } from '@/components/InstallAppCard';
import { ActivityCard } from '@/components/ActivityCard';

type SettingsTab = 'family' | 'general' | 'display' | 'connections' | 'activity' | 'data';

export function Household() {
  const { data } = useHousehold();
  const toast = useToast();
  const prefs = usePrefs();
  const [section, setSection] = useState<SettingsTab>('family');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [week, setWeek] = useState<'monday' | 'sunday'>('monday');
  const [appName, setAppName] = useState('Lar');
  const [appTagline, setAppTagline] = useState("The family's home hub");
  useEffect(() => {
    if (data) {
      setName(data.settings.household_name);
      setCurrency(data.settings.currency);
      setWeek(data.settings.week_starts_on);
      setAppName(data.settings.app_name);
      setAppTagline(data.settings.app_tagline);
    }
  }, [data]);
  const saveSettings = useInvalidatingMutation(() => api.updateSettings({ household_name: name.trim() || 'Lar', app_name: appName.trim() || 'Lar', app_tagline: appTagline.trim(), currency: currency.trim().toUpperCase() || 'USD', week_starts_on: week }), ['household']);

  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [groupSheet, setGroupSheet] = useState<Group | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'member' | 'group'; id: number; name: string } | null>(null);
  const deleteMember = useInvalidatingMutation((id: number) => api.deleteMember(id), ['household', 'tasks', 'shopping', 'projects']);
  const deleteGroup = useInvalidatingMutation((id: number) => api.deleteGroup(id), ['household', 'tasks', 'shopping']);

  const dirty = data && (name !== data.settings.household_name || appName !== data.settings.app_name || appTagline !== data.settings.app_tagline || currency !== data.settings.currency || week !== data.settings.week_starts_on);
  const origin = window.location.origin;
  const me = data?.members.find((m) => m.id === prefs.memberId);
  const dashboardLabels: Record<DashboardSection, string> = { todos: 'To-do list', shopping: 'Shopping list', calendar: 'Calendar', menu: 'Weekly menu', projects: 'Projects' };
  const visibleDashboard = prefs.dashboardOrder;
  const delayUnit = prefs.completionDelaySeconds >= 60 && prefs.completionDelaySeconds % 60 === 0 ? 'minutes' : 'seconds';
  const delayValue = delayUnit === 'minutes' ? prefs.completionDelaySeconds / 60 : prefs.completionDelaySeconds;
  const moveDashboard = (key: DashboardSection, direction: -1 | 1) => {
    const visibleFrom = visibleDashboard.indexOf(key);
    const neighbour = visibleDashboard[visibleFrom + direction];
    if (visibleFrom < 0 || !neighbour) return;
    const next = [...prefs.dashboardOrder];
    const from = next.indexOf(key);
    const to = next.indexOf(neighbour);
    [next[from], next[to]] = [next[to]!, next[from]!];
    setPrefs({ dashboardOrder: next });
  };
  const toggleDashboard = (key: DashboardSection) => {
    setPrefs({ dashboardHidden: prefs.dashboardHidden.includes(key) ? prefs.dashboardHidden.filter((item) => item !== key) : [...prefs.dashboardHidden, key] });
  };
  const settingsTabs: { key: SettingsTab; label: string; icon: typeof Users }[] = [
    { key: 'family', label: 'Family', icon: Users },
    { key: 'general', label: 'General', icon: SettingsIcon },
    { key: 'display', label: 'Display', icon: Type },
    { key: 'connections', label: 'Connections', icon: Plug },
    { key: 'activity', label: 'Activity', icon: ActivityIcon },
    { key: 'data', label: 'Data', icon: HardDrive },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Household</h1>
          <p className="sub">The people, groups, and settings behind your Lar.</p>
        </div>
      </header>

      <div className="tabs settings-tabs" role="tablist" aria-label="Household settings">
        {settingsTabs.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={section === item.key} className={section === item.key ? 'on' : ''} onClick={() => setSection(item.key)}>
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </div>

      {section === 'family' && <div className="grid-2">
        <Card title="People" icon={UserRound} flush action={!me?.is_kid ? <Button size="sm" icon={Plus} onClick={() => setMemberSheet('new')}>Add person</Button> : undefined}>
          <div className="list">
            {data?.members.map((m) => (
              <div key={m.id} className="rowitem" onClick={() => setMemberSheet(m)}>
                <Avatar member={m} size="lg" />
                <div className="body">
                  <div className="title">{m.name}</div>
                  <div className="meta">
                    {m.has_password && <Lock size={12} aria-label="Password protected" />}
                    {m.is_kid && <span className="row" style={{ gap: 3 }}><Baby size={12} /> Kid</span>}
                    {m.id === prefs.memberId ? 'This device' : data.groups.filter((g) => g.member_ids.includes(m.id)).map((g) => g.name).join(', ')}
                  </div>
                </div>
                <div className="side">
                  <IconButton icon={Pencil} label="Edit" onClick={(e) => { e.stopPropagation(); setMemberSheet(m); }} />
                  {!(me?.is_kid && m.id === me.id) && <IconButton icon={Trash2} label="Remove" danger onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'member', id: m.id, name: m.name }); }} />}
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
      </div>}

      {section === 'general' && (
        <Card title="Settings" icon={SettingsIcon}>
          <div className="form">
            <Field label="Household name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <div className="form-grid">
              <Field label="App name" hint="shown in the header"><Input value={appName} onChange={(e) => setAppName(e.target.value)} maxLength={40} /></Field>
              <Field label="Tagline" hint="shown below the name"><Input value={appTagline} onChange={(e) => setAppTagline(e.target.value)} maxLength={100} placeholder="The family's home hub" /></Field>
            </div>
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
      )}

      {section === 'connections' && (
        <Card title="Agents & API" icon={Plug}>
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <b style={{ fontSize: 14 }}>Let an agent use Lar</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Lar is an MCP server. Add this address to Hermes Agent, Claude, or any Model Context Protocol client and it can read and change to-dos, shopping, and projects by name.
              </p>
              <code className="mono" style={{ display: 'block', marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, wordBreak: 'break-all' }}>{origin}/mcp</code>
              <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Send an <code className="mono">X-Lar-Agent</code> header with the agent's name so the activity log shows who did what.</p>
            </div>
            <div>
              <b style={{ fontSize: 14 }}>REST API for scripts</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Everything the app does is available as JSON. Open the address for a map of all routes.</p>
              <code className="mono" style={{ display: 'block', marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, wordBreak: 'break-all' }}>{origin}/api/v1</code>
            </div>
          </div>
        </Card>
      )}

      {section === 'display' && <Card title="Display & behaviour" icon={Type}>
        <div className="settings-columns">
          <div className="form">
            <Field label="Text size" hint="this device">
              <Segmented<TextSize>
                value={prefs.textSize}
                onChange={(textSize) => { setPrefs({ textSize }); applyTextSize(textSize); }}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'large', label: 'Large' },
                  { value: 'extra-large', label: 'Extra large' },
                  { value: 'huge', label: 'Huge' },
                ]}
              />
            </Field>
            <Field label="Touch target size" hint="this device">
              <Segmented<'standard' | 'large'> value={prefs.largeTargets ? 'large' : 'standard'} onChange={(value) => { const largeTargets = value === 'large'; setPrefs({ largeTargets }); applyLargeTargets(largeTargets); }} options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }]} />
            </Field>
            <Field label="Colour palette" hint="this device">
              <Segmented<Palette> value={prefs.palette} onChange={(palette) => { setPrefs({ palette }); applyPalette(palette); }} options={[{ value: 'classic', label: 'Classic' }, { value: 'ocean', label: 'Ocean' }, { value: 'berry', label: 'Berry' }, { value: 'sunset', label: 'Sunset' }]} />
            </Field>
            <Field label="Notifications" hint="optional, this device">
              <div className="row wrap"><Button icon={Bell} onClick={async () => { if (!('Notification' in window)) return toast('This browser does not support notifications'); const permission = await Notification.requestPermission(); const notificationsEnabled = permission === 'granted'; setPrefs({ notificationsEnabled }); toast(notificationsEnabled ? 'Gentle reminders are on' : 'Notifications were not allowed'); }}>{prefs.notificationsEnabled ? 'Notifications on' : 'Enable reminders'}</Button>{prefs.notificationsEnabled && <Button variant="ghost" onClick={() => setPrefs({ notificationsEnabled: false })}>Turn off</Button>}</div>
            </Field>
            <Field label="After checking an item" hint="to-dos and shopping">
              <Select value={prefs.completionMode} onChange={(e) => setPrefs({ completionMode: e.target.value as CompletionMode })}>
                <option value="instant">Move it right away</option>
                <option value="delay">Move it after a delay</option>
                <option value="screen">Keep it checked until I leave the screen</option>
              </Select>
            </Field>
            {prefs.completionMode === 'delay' && (
              <div className="form-grid">
                <Field label="Delay">
                  <Input
                    type="number"
                    min={1}
                    max={delayUnit === 'minutes' ? 60 : 3600}
                    inputMode="numeric"
                    value={delayValue}
                    onChange={(e) => {
                      const value = Math.max(1, Number(e.target.value) || 1);
                      setPrefs({ completionDelaySeconds: delayUnit === 'minutes' ? value * 60 : value });
                    }}
                  />
                </Field>
                <Field label="Unit">
                  <Select
                    value={delayUnit}
                    onChange={(e) => setPrefs({ completionDelaySeconds: e.target.value === 'minutes' ? Math.max(60, delayValue * 60) : Math.max(1, delayValue) })}
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <div className="form">
            <div className="field">
              <span>Today dashboard order <em>this device</em></span>
              <div className="dashboard-order">
                {visibleDashboard.map((key, index) => (
                  <div key={key} className={prefs.dashboardHidden.includes(key) ? 'is-hidden' : ''}>
                    <ListChecks size={16} className="faint" />
                    <b>{dashboardLabels[key]}</b>
                    <div className="right row" style={{ gap: 2 }}>
                      <IconButton icon={prefs.dashboardHidden.includes(key) ? EyeOff : Eye} label={`${prefs.dashboardHidden.includes(key) ? 'Show' : 'Hide'} ${dashboardLabels[key]}`} onClick={() => toggleDashboard(key)} />
                      <IconButton icon={ChevronUp} label={`Move ${dashboardLabels[key]} up`} disabled={index === 0} onClick={() => moveDashboard(key, -1)} />
                      <IconButton icon={ChevronDown} label={`Move ${dashboardLabels[key]} down`} disabled={index === visibleDashboard.length - 1} onClick={() => moveDashboard(key, 1)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>}

      {section === 'connections' && <><InstallAppCard /><CalendarsCard /></>}
      {section === 'activity' && <ActivityCard />}
      {section === 'data' && <><Card title="About Lar" icon={Code2}><p className="muted">Lar is free, self-hosted, and open source. Your household data stays on your own server.</p><a className="btn btn-secondary" style={{ marginTop: 14, display: 'inline-flex' }} href="https://github.com/fernando-granco/Lar" target="_blank" rel="noreferrer"><Code2 /> View Lar on GitHub</a></Card><BackupCard /></>}

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
  const prefs = usePrefs();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const [initials, setInitials] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isKid, setIsKid] = useState(false);
  const [pwMode, setPwMode] = useState<'closed' | 'set' | 'change' | 'remove'>('closed');
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? '');
    setColor(member?.color ?? PALETTE[(data?.members.length ?? 0) % PALETTE.length]!);
    setInitials(member?.initials ?? '');
    setEmail(member?.email ?? '');
    setAvatarUrl(member?.avatar_url ?? '');
    setIsKid(member?.is_kid ?? false);
    setPwMode('closed');
    setCurrent('');
    setPw('');
    setPwError('');
  }, [open, member, data?.members.length]);
  const save = useInvalidatingMutation(
    () =>
      member
        ? api.updateMember(member.id, { name: name.trim(), color, initials: initials.trim() || undefined, email: data?.settings.access_sign_in ? email.trim() || null : undefined, is_kid: isKid, avatar_url: avatarUrl })
        : api.createMember({ name: name.trim(), color, initials: initials.trim() || undefined, email: data?.settings.access_sign_in ? email.trim() || undefined : undefined, is_kid: isKid, avatar_url: avatarUrl }),
    ['household'],
  );
  const password = useInvalidatingMutation(async () => {
    if (!member) return;
    if (pwMode === 'remove') {
      await api.removePassword(member.id, current);
      if (prefs.memberId === member.id) setPrefs({ unlockToken: null });
      return;
    }
    const r = await api.setPassword(member.id, pw, pwMode === 'change' ? current : undefined);
    if (prefs.memberId === member.id) setPrefs({ unlockToken: r.token });
  }, ['household']);
  const isMe = member?.id === prefs.memberId;
  const currentActor = data?.members.find((m) => m.id === prefs.memberId);
  const selfRestricted = Boolean(member?.is_kid && isMe);

  return (
    <Sheet open={open} onClose={onClose} title={member ? 'Edit person' : 'Add a person'} footer={<Button variant="primary" className="right" disabled={!name.trim() || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast(member ? 'Saved' : `${name.trim()} added`); onClose(); }}>{member ? 'Save' : 'Add'}</Button>}>
      <div className="form">
        <div className="row">
          <Avatar member={{ name: name || '?', color, initials: initials || (name ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') : '?'), avatar_url: avatarUrl }} size="lg" />
          <Field label="Name" className="grow">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Maria" />
          </Field>
        </div>
        <Field label="Profile picture" hint="optional">
          <div className="row wrap"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) return toast('Choose an image smaller than 1 MB'); const reader = new FileReader(); reader.onload = () => setAvatarUrl(String(reader.result)); reader.readAsDataURL(file); }} />{avatarUrl && <Button size="sm" variant="ghost" onClick={() => setAvatarUrl('')}>Remove picture</Button>}</div>
          <p className="faint" style={{ fontSize: 12, marginTop: 5 }}>Saved in Lar's backup. PNG, JPEG, or WebP up to 1 MB.</p>
        </Field>
        <Field label="Color">
          <ColorDots value={color} onChange={setColor} />
        </Field>
        <Field label="Profile type">
          {currentActor?.is_kid ? (
            <p className="muted">{isKid ? 'Kid profile' : 'Adult profile'}</p>
          ) : (
            <Segmented<'adult' | 'kid'>
              value={isKid ? 'kid' : 'adult'}
              onChange={(value) => setIsKid(value === 'kid')}
              options={[
                { value: 'adult', label: 'Adult' },
                { value: 'kid', label: <span className="row" style={{ gap: 5 }}><Baby size={14} /> Kid</span> },
              ]}
            />
          )}
          {isKid && <p className="faint" style={{ fontSize: 12.5 }}>Kid profiles cannot add people, remove themselves, or manage their own password.</p>}
        </Field>
        <div className="form-grid">
          <Field label="Initials" hint="optional">
            <Input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} placeholder="Auto" />
          </Field>
          {data?.settings.access_sign_in && (
            <Field label="Email" hint="for automatic sign-in">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="name@example.com" autoComplete="off" />
            </Field>
          )}
        </div>

        {member && (
          <div className="stack" style={{ gap: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <div className="row">
              <Lock size={16} className="faint" />
              <b style={{ fontSize: 14 }} className="grow">{member.has_password ? 'Password protected' : 'No password'}</b>
              {pwMode === 'closed' && !selfRestricted && (
                member.has_password ? (
                  <div className="row" style={{ gap: 4 }}>
                    <Button size="sm" onClick={() => setPwMode('change')}>Change</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPwMode('remove')}>Remove</Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setPwMode('set')}>Add password</Button>
                )
              )}
            </div>
            <p className="faint" style={{ fontSize: 12.5 }}>
              {selfRestricted
                ? 'Kid profiles cannot add or change their own password. An adult can manage it from their profile.'
                : member.has_password
                ? 'Devices must enter the password once before acting as this person. Forgot it? On the server run: docker exec lar node dist/server/cli.js reset-password ' + member.name
                : 'Optional. Without one, anyone in the house can pick this person.'}
            </p>
            {pwMode !== 'closed' && !selfRestricted && (
              <form
                className="form"
                style={{ gap: 10 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPwError('');
                  try {
                    await password.mutateAsync(undefined as never);
                    toast(pwMode === 'remove' ? 'Password removed' : 'Password saved');
                    setPwMode('closed');
                    setCurrent('');
                    setPw('');
                  } catch (err) {
                    setPwError((err as Error).message);
                  }
                }}
              >
                {(pwMode === 'change' || pwMode === 'remove') && (
                  <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus /></Field>
                )}
                {pwMode !== 'remove' && (
                  <Field label={pwMode === 'change' ? 'New password' : 'Password'} hint="at least 4 characters"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus={pwMode === 'set'} /></Field>
                )}
                {pwError && <p className="error">{pwError}</p>}
                <div className="row">
                  <Button variant="ghost" size="sm" onClick={() => setPwMode('closed')}>Cancel</Button>
                  <Button variant={pwMode === 'remove' ? 'danger' : 'primary'} size="sm" type="submit" className="right" disabled={password.isPending || (pwMode !== 'remove' && pw.length < 4) || ((pwMode === 'change' || pwMode === 'remove') && !current)}>
                    {pwMode === 'remove' ? 'Remove password' : 'Save password'}
                  </Button>
                </div>
              </form>
            )}
            {!isMe && !member.has_password && <p className="faint" style={{ fontSize: 12 }}>Tip: pick yourself in the sidebar first if this password is for you.</p>}
          </div>
        )}
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
