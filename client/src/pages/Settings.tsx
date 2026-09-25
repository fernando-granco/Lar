import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Users, UserRound, Plug, Moon, Sun, Monitor, Lock, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, ListChecks, Baby, Eye, EyeOff,
  Activity as ActivityIcon, HardDrive, Bell, Code2, Home, Palette as PaletteIcon, LayoutDashboard, ShieldCheck, TriangleAlert, Bot,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useHousehold, useInvalidatingMutation, useIsMobile, usePermissions } from '@/lib/hooks';
import {
  usePrefs, setPrefs, setNotify, applyTheme, applyTextSize, applyPalette, applyLargeTargets, applyCorners, applyHeadingFont,
  type CompletionMode, type DashboardSection, type TextSize, type Palette, type Corners, type HeadingFont,
} from '@/lib/store';
import { notify, notificationsNeedHttps, notificationsSupported } from '@/lib/notifications';
import { Card, Button, Field, Input, Select, Avatar, IconButton, ColorDots, Chip, Segmented, Empty, PALETTE, cx } from '@/components/ui';
import { Sheet, Confirm } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import type { Member, Group, KidPermission } from '@shared/types';
import { CalendarsCard } from '@/components/CalendarsCard';
import { BackupCard } from '@/components/BackupCard';
import { InstallAppCard } from '@/components/InstallAppCard';
import { ActivityCard } from '@/components/ActivityCard';

type Section = 'people' | 'household' | 'appearance' | 'today' | 'notifications' | 'connections' | 'activity' | 'data';

const SECTIONS: { key: Section; label: string; icon: typeof Users; hint: string }[] = [
  { key: 'people', label: 'People', icon: Users, hint: 'Family, groups, and what kids can do' },
  { key: 'household', label: 'Household', icon: Home, hint: 'Name, currency, and when the week starts' },
  { key: 'appearance', label: 'Appearance', icon: PaletteIcon, hint: 'Theme, colours, and text size' },
  { key: 'today', label: 'Today & lists', icon: LayoutDashboard, hint: 'Your dashboard and checking things off' },
  { key: 'notifications', label: 'Notifications', icon: Bell, hint: 'Which reminders this device shows' },
  { key: 'connections', label: 'Connections', icon: Plug, hint: 'Install the app, calendars, agents and API' },
  { key: 'activity', label: 'Activity', icon: ActivityIcon, hint: 'What changed recently, and who changed it' },
  { key: 'data', label: 'Backup & about', icon: HardDrive, hint: 'Download or restore everything' },
];

export function Settings() {
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const requested = SECTIONS.find((s) => s.key === params.get('section'))?.key;
  // Phones open on a list of sections; larger screens show the first one next to the tabs.
  const section: Section | null = requested ?? (isMobile ? null : 'people');
  const open = (key: Section | null) => setParams(key ? { section: key } : {}, { replace: !isMobile });
  const current = SECTIONS.find((s) => s.key === section);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isMobile && current ? current.label : 'Settings'}</h1>
          <p className="sub">{isMobile && current ? current.hint : 'How Lar works for your family, and on this device.'}</p>
        </div>
      </header>

      {isMobile ? (
        section === null ? (
          <nav className="settings-menu card" aria-label="Settings">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" onClick={() => open(s.key)}>
                <span className="icon-badge"><s.icon /></span>
                <span className="grow">
                  <b>{s.label}</b>
                  <small>{s.hint}</small>
                </span>
                <ChevronRight size={18} className="faint" />
              </button>
            ))}
          </nav>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm settings-back" onClick={() => open(null)}>
            <ChevronLeft /> All settings
          </button>
        )
      ) : (
        <div className="tabs settings-tabs" role="tablist" aria-label="Settings">
          {SECTIONS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={section === item.key} className={section === item.key ? 'on' : ''} onClick={() => open(item.key)}>
              <item.icon size={15} /> {item.label}
            </button>
          ))}
        </div>
      )}

      {section === 'people' && <PeopleSection />}
      {section === 'household' && <HouseholdSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'today' && <TodaySection />}
      {section === 'notifications' && <NotificationsSection />}
      {section === 'connections' && <><InstallAppCard /><CalendarsCard /><AgentsCard /></>}
      {section === 'activity' && <ActivityCard />}
      {section === 'data' && (
        <>
          <BackupCard />
          <Card title="About Lar" icon={Code2}>
            <p className="muted">Lar is free, self-hosted, and open source. Your household data stays on your own server.</p>
            <a className="btn btn-secondary" style={{ marginTop: 14, display: 'inline-flex' }} href="https://github.com/fernando-granco/Lar" target="_blank" rel="noreferrer"><Code2 /> View Lar on GitHub</a>
          </Card>
        </>
      )}
    </div>
  );
}

/** A labelled on/off switch row. */
function Toggle({ on, onChange, title, hint, disabled, children }: { on: boolean; onChange: (on: boolean) => void; title: string; hint?: ReactNode; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className={cx('toggle-row', disabled && 'disabled')}>
      <label>
        <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch" aria-hidden />
        <span className="grow">
          <b>{title}</b>
          {hint && <small>{hint}</small>}
        </span>
      </label>
      {children && on && <div className="toggle-extra">{children}</div>}
    </div>
  );
}

// ---------------- People ----------------

const KID_AREAS: { key: KidPermission; title: string; hint: string }[] = [
  { key: 'todos', title: "Change other people's to-dos", hint: 'Edit, reschedule, and delete to-dos someone else added.' },
  { key: 'shopping', title: "Change other people's shopping items", hint: 'Edit and remove items someone else added, and manage lists.' },
  { key: 'projects', title: 'Change projects', hint: 'Details, milestones, budget, links, and notes in projects an adult started.' },
  { key: 'recipes', title: 'Change recipes and plan the menu', hint: 'Edit recipes someone else added and fill in the weekly menu.' },
];

function PeopleSection() {
  const { data } = useHousehold();
  const toast = useToast();
  const prefs = usePrefs();
  const { isKid, isAdult } = usePermissions();
  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [groupSheet, setGroupSheet] = useState<Group | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'member' | 'group'; id: number; name: string } | null>(null);
  const deleteMember = useInvalidatingMutation((id: number) => api.deleteMember(id), ['household', 'tasks', 'shopping', 'projects']);
  const deleteGroup = useInvalidatingMutation((id: number) => api.deleteGroup(id), ['household', 'tasks', 'shopping']);
  const setKidPermission = useInvalidatingMutation((patch: Partial<Record<KidPermission, boolean>>) => api.updateSettings({ kid_permissions: patch }), ['household']);
  const members = data?.members ?? [];
  const kids = members.filter((m) => m.is_kid);
  const openAdults = members.filter((m) => !m.is_kid && !m.has_password);

  return (
    <>
      <div className="grid-2">
        <Card title="People" icon={UserRound} flush action={isAdult ? <Button size="sm" icon={Plus} onClick={() => setMemberSheet('new')}>Add person</Button> : undefined}>
          <div className="list">
            {members.map((m) => {
              const editable = !isKid || m.id === prefs.memberId;
              return (
                <div key={m.id} className="rowitem" onClick={() => editable && setMemberSheet(m)} style={editable ? undefined : { cursor: 'default' }}>
                  <Avatar member={m} size="lg" />
                  <div className="body">
                    <div className="title">{m.name}</div>
                    <div className="meta">
                      {m.has_password && <Lock size={12} aria-label="Password protected" />}
                      {m.is_kid && <span className="row" style={{ gap: 3 }}><Baby size={12} /> Kid</span>}
                      {m.id === prefs.memberId ? 'This device' : data!.groups.filter((g) => g.member_ids.includes(m.id)).map((g) => g.name).join(', ')}
                    </div>
                  </div>
                  <div className="side">
                    {editable && <IconButton icon={Pencil} label="Edit" onClick={(e) => { e.stopPropagation(); setMemberSheet(m); }} />}
                    {isAdult && <IconButton icon={Trash2} label="Remove" danger onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'member', id: m.id, name: m.name }); }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Groups" icon={Users} flush action={isAdult ? <Button size="sm" icon={Plus} onClick={() => setGroupSheet('new')}>Add group</Button> : undefined}>
          {data?.groups.length ? (
            <div className="list">
              {data.groups.map((g) => (
                <div key={g.id} className="rowitem" onClick={() => isAdult && setGroupSheet(g)} style={isAdult ? undefined : { cursor: 'default' }}>
                  <Avatar member={{ name: g.name, color: g.color, initials: g.name.slice(0, 2).toUpperCase() }} size="lg" group />
                  <div className="body">
                    <div className="title">{g.name}</div>
                    <div className="meta">{g.member_ids.length ? members.filter((m) => g.member_ids.includes(m.id)).map((m) => m.name).join(', ') : 'No one yet'}</div>
                  </div>
                  {isAdult && (
                    <div className="side">
                      <IconButton icon={Pencil} label="Edit" onClick={(e) => { e.stopPropagation(); setGroupSheet(g); }} />
                      <IconButton icon={Trash2} label="Delete" danger onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'group', id: g.id, name: g.name }); }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Users} title="No groups yet" hint='Groups like "Kids" or "Adults" make assigning things quick.' />
          )}
        </Card>
      </div>

      <Card title="What kids can do" icon={Baby}>
        <div className="stack" style={{ gap: 12 }}>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Kid profiles can always add to-dos and shopping items, tick things off, and change what they added themselves. They never change household settings, people, groups, calendars, passwords, agent access, or backups.
            {isKid && ' An adult can change what else kids can do.'}
          </p>
          {KID_AREAS.map((area) => (
            <Toggle
              key={area.key}
              on={!!data?.settings.kid_permissions[area.key]}
              disabled={!isAdult || setKidPermission.isPending}
              onChange={(on) => setKidPermission.mutate({ [area.key]: on })}
              title={area.title}
              hint={area.hint}
            />
          ))}
          {kids.length > 0 && openAdults.length > 0 && (
            <p className="notice warn">
              <TriangleAlert size={16} />
              <span>
                {openAdults.map((m) => m.name).join(' and ')} {openAdults.length === 1 ? 'has' : 'have'} no password, so anyone on a shared device can pick {openAdults.length === 1 ? 'that profile' : 'those profiles'} and skip these limits. Add a password from {openAdults.length === 1 ? 'that' : 'each'} person's own profile.
              </span>
            </p>
          )}
        </div>
      </Card>

      <MemberSheet open={memberSheet !== null} member={memberSheet === 'new' ? null : memberSheet} onClose={() => setMemberSheet(null)} />
      <GroupSheet open={groupSheet !== null} group={groupSheet === 'new' ? null : groupSheet} members={members} onClose={() => setGroupSheet(null)} />
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
    </>
  );
}

function MemberSheet({ open, member, onClose }: { open: boolean; member: Member | null; onClose: () => void }) {
  const toast = useToast();
  const { data } = useHousehold();
  const prefs = usePrefs();
  const { isKid: actorIsKid } = usePermissions();
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
        ? api.updateMember(member.id, { name: name.trim(), color, initials: initials.trim() || undefined, email: data?.settings.access_sign_in && !actorIsKid ? email.trim() || null : undefined, ...(actorIsKid ? {} : { is_kid: isKid }), avatar_url: avatarUrl })
        : api.createMember({ name: name.trim(), color, initials: initials.trim() || undefined, email: data?.settings.access_sign_in ? email.trim() || undefined : undefined, is_kid: isKid, avatar_url: avatarUrl }),
    ['household'],
  );
  const isMe = member?.id === prefs.memberId;
  // An adult manages a kid's password without knowing the old one; everyone else manages only their own.
  const managesForKid = !!member?.is_kid && !actorIsKid && !isMe;
  const canManagePassword = !!member && !actorIsKid && (isMe || managesForKid);
  const needsCurrent = !managesForKid && (pwMode === 'change' || pwMode === 'remove');
  const password = useInvalidatingMutation(async () => {
    if (!member) return;
    if (pwMode === 'remove') {
      await api.removePassword(member.id, needsCurrent ? current : undefined);
      if (isMe) setPrefs({ unlockToken: null });
      return;
    }
    const r = await api.setPassword(member.id, pw, needsCurrent ? current : undefined);
    if (isMe && r.token) setPrefs({ unlockToken: r.token });
  }, ['household'], { inlineErrors: true });

  const passwordHint = !member
    ? ''
    : actorIsKid
    ? 'Kid profiles cannot add or change passwords. Ask an adult.'
    : !canManagePassword
    ? `Only ${member.name} can set a password for their profile. They can do it from their own device.`
    : managesForKid
    ? `As an adult you can set or reset ${member.name}'s password. Their devices will need the new one.`
    : member.has_password
    ? 'Devices must enter the password once before acting as you. Forgot it? On the server run: docker exec lar node dist/server/cli.js reset-password ' + member.name
    : 'Optional. Without one, anyone in the house can pick your profile.';

  return (
    <Sheet open={open} onClose={onClose} title={member ? (isMe ? 'Your profile' : 'Edit person') : 'Add a person'} footer={<Button variant="primary" className="right" disabled={!name.trim() || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast(member ? 'Saved' : `${name.trim()} added`); onClose(); }}>{member ? 'Save' : 'Add'}</Button>}>
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
          {actorIsKid ? (
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
          {isKid && <p className="faint" style={{ fontSize: 12.5 }}>Kids add things and tick them off. What else they can change is set under “What kids can do”.</p>}
        </Field>
        <div className="form-grid">
          <Field label="Initials" hint="optional">
            <Input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} placeholder="Auto" />
          </Field>
          {data?.settings.access_sign_in && !actorIsKid && (
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
              {pwMode === 'closed' && canManagePassword && (
                member.has_password ? (
                  <div className="row" style={{ gap: 4 }}>
                    <Button size="sm" onClick={() => setPwMode('change')}>{managesForKid ? 'Reset' : 'Change'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPwMode('remove')}>Remove</Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setPwMode('set')}>Add password</Button>
                )
              )}
            </div>
            <p className="faint" style={{ fontSize: 12.5 }}>{passwordHint}</p>
            {pwMode !== 'closed' && canManagePassword && (
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
                {needsCurrent && (
                  <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus /></Field>
                )}
                {pwMode !== 'remove' && (
                  <Field label={pwMode === 'change' ? 'New password' : 'Password'} hint="at least 4 characters"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus={!needsCurrent} /></Field>
                )}
                {pwMode === 'remove' && managesForKid && <p className="muted" style={{ fontSize: 13 }}>Anyone will be able to pick {member.name} again.</p>}
                {pwError && <p className="error">{pwError}</p>}
                <div className="row">
                  <Button variant="ghost" size="sm" onClick={() => setPwMode('closed')}>Cancel</Button>
                  <Button variant={pwMode === 'remove' ? 'danger' : 'primary'} size="sm" type="submit" className="right" disabled={password.isPending || (pwMode !== 'remove' && pw.length < 4) || (needsCurrent && !current)}>
                    {pwMode === 'remove' ? 'Remove password' : 'Save password'}
                  </Button>
                </div>
              </form>
            )}
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

// ---------------- Household ----------------

function HouseholdSection() {
  const { data } = useHousehold();
  const toast = useToast();
  const { isAdult } = usePermissions();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [week, setWeek] = useState<'monday' | 'sunday'>('monday');
  const [appName, setAppName] = useState('Lar');
  const [appTagline, setAppTagline] = useState("The family's home hub");
  useEffect(() => {
    if (!data) return;
    setName(data.settings.household_name);
    setCurrency(data.settings.currency);
    setWeek(data.settings.week_starts_on);
    setAppName(data.settings.app_name);
    setAppTagline(data.settings.app_tagline);
  }, [data]);
  const save = useInvalidatingMutation(() => api.updateSettings({ household_name: name.trim() || 'Lar', app_name: appName.trim() || 'Lar', app_tagline: appTagline.trim(), currency: currency.trim().toUpperCase() || 'USD', week_starts_on: week }), ['household']);
  const dirty = data && (name !== data.settings.household_name || appName !== data.settings.app_name || appTagline !== data.settings.app_tagline || currency !== data.settings.currency || week !== data.settings.week_starts_on);
  return (
    <Card title="Household" icon={Home}>
      <fieldset className="form" disabled={!isAdult}>
        {!isAdult && <p className="muted" style={{ fontSize: 13.5 }}>An adult can change these.</p>}
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
          <Field label="Week starts on" hint="also sets “this week”">
            <Select value={week} onChange={(e) => setWeek(e.target.value as 'monday' | 'sunday')}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Field>
        </div>
        {isAdult && (
          <div className="row">
            <Button variant="primary" disabled={!dirty || save.isPending} onClick={async () => { await save.mutateAsync(undefined as never); toast('Settings saved'); }}>Save</Button>
          </div>
        )}
      </fieldset>
    </Card>
  );
}

// ---------------- Appearance ----------------

const PALETTES: { value: Palette; label: string; colors: [string, string] }[] = [
  { value: 'classic', label: 'Classic', colors: ['#345a51', '#db744f'] },
  { value: 'ocean', label: 'Ocean', colors: ['#27677a', '#d86a54'] },
  { value: 'berry', label: 'Berry', colors: ['#695180', '#c76680'] },
  { value: 'sunset', label: 'Sunset', colors: ['#9b5a32', '#aa4d57'] },
  { value: 'forest', label: 'Forest', colors: ['#3d6b35', '#c07a2c'] },
  { value: 'slate', label: 'Slate', colors: ['#3f5873', '#c0694f'] },
];

function AppearanceSection() {
  const prefs = usePrefs();
  const setPalette = (palette: Palette, custom = { primary: prefs.customPrimary, accent: prefs.customAccent }) => {
    setPrefs({ palette, customPrimary: custom.primary, customAccent: custom.accent });
    applyPalette(palette, custom);
  };
  return (
    <Card title="Appearance" icon={PaletteIcon}>
      <div className="settings-columns">
        <div className="form">
          <p className="faint" style={{ fontSize: 12.5 }}>These apply to this device only, so everyone can have their own.</p>
          <Field label="Theme">
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
          <div className="field">
            <span>Colours <em>light and dark</em></span>
            <div className="swatches" role="radiogroup" aria-label="Colour palette">
              {PALETTES.map((p) => (
                <button key={p.value} type="button" role="radio" aria-checked={prefs.palette === p.value} className={cx('swatch', prefs.palette === p.value && 'on')} onClick={() => setPalette(p.value)}>
                  <span className="dots"><i style={{ background: p.colors[0] }} /><i style={{ background: p.colors[1] }} /></span>
                  {p.label}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={prefs.palette === 'custom'} className={cx('swatch', prefs.palette === 'custom' && 'on')} onClick={() => setPalette('custom')}>
                <span className="dots"><i style={{ background: prefs.customPrimary }} /><i style={{ background: prefs.customAccent }} /></span>
                Your own
              </button>
            </div>
          </div>
          {prefs.palette === 'custom' && (
            <div className="form-grid">
              <Field label="Main colour" hint="buttons, links">
                <input className="color-input" type="color" value={prefs.customPrimary} onChange={(e) => setPalette('custom', { primary: e.target.value, accent: prefs.customAccent })} />
              </Field>
              <Field label="Accent colour" hint="highlights">
                <input className="color-input" type="color" value={prefs.customAccent} onChange={(e) => setPalette('custom', { primary: prefs.customPrimary, accent: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Corners">
            <Segmented<Corners> value={prefs.corners} onChange={(corners) => { setPrefs({ corners }); applyCorners(corners); }} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'soft', label: 'Soft' }, { value: 'square', label: 'Square' }]} />
          </Field>
          <Field label="Headings">
            <Segmented<HeadingFont> value={prefs.headingFont} onChange={(headingFont) => { setPrefs({ headingFont }); applyHeadingFont(headingFont); }} options={[{ value: 'serif', label: <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600 }}>Classic</span> }, { value: 'sans', label: <span style={{ fontWeight: 700 }}>Modern</span> }]} />
          </Field>
        </div>
        <div className="form">
          <Field label="Text size">
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
          <Field label="Touch targets" hint="bigger buttons and checkboxes">
            <Segmented<'standard' | 'large'> value={prefs.largeTargets ? 'large' : 'standard'} onChange={(value) => { const largeTargets = value === 'large'; setPrefs({ largeTargets }); applyLargeTargets(largeTargets); }} options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }]} />
          </Field>
          <div className="appearance-preview card">
            <b className="display">Preview</b>
            <p className="muted">Buttons, links, and highlights use your colours.</p>
            <div className="row wrap">
              <Button variant="primary" icon={Plus}>To-do</Button>
              <Button>Secondary</Button>
              <span className="badge success">Active</span>
              <span className="chip on">Chosen</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------- Today & lists ----------------

const DASHBOARD_LABELS: Record<DashboardSection, string> = { todos: 'To-do list', shopping: 'Shopping list', calendar: 'Calendar', menu: 'Weekly menu', notes: 'Pinned project notes', projects: 'Projects' };

function TodaySection() {
  const prefs = usePrefs();
  const order = prefs.dashboardOrder;
  const delayUnit = prefs.completionDelaySeconds >= 60 && prefs.completionDelaySeconds % 60 === 0 ? 'minutes' : 'seconds';
  const delayValue = delayUnit === 'minutes' ? prefs.completionDelaySeconds / 60 : prefs.completionDelaySeconds;
  const move = (key: DashboardSection, direction: -1 | 1) => {
    const next = [...order];
    const from = next.indexOf(key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!];
    setPrefs({ dashboardOrder: next });
  };
  const toggle = (key: DashboardSection) => setPrefs({ dashboardHidden: prefs.dashboardHidden.includes(key) ? prefs.dashboardHidden.filter((item) => item !== key) : [...prefs.dashboardHidden, key] });
  return (
    <Card title="Today & lists" icon={LayoutDashboard}>
      <div className="settings-columns">
        <div className="form">
          <div className="field">
            <span>Today dashboard <em>this device</em></span>
            <div className="dashboard-order">
              {order.map((key, index) => (
                <div key={key} className={prefs.dashboardHidden.includes(key) ? 'is-hidden' : ''}>
                  <ListChecks size={16} className="faint" />
                  <b>{DASHBOARD_LABELS[key]}</b>
                  <div className="right row" style={{ gap: 2 }}>
                    <IconButton icon={prefs.dashboardHidden.includes(key) ? EyeOff : Eye} label={`${prefs.dashboardHidden.includes(key) ? 'Show' : 'Hide'} ${DASHBOARD_LABELS[key]}`} onClick={() => toggle(key)} />
                    <IconButton icon={ChevronUp} label={`Move ${DASHBOARD_LABELS[key]} up`} disabled={index === 0} onClick={() => move(key, -1)} />
                    <IconButton icon={ChevronDown} label={`Move ${DASHBOARD_LABELS[key]} down`} disabled={index === order.length - 1} onClick={() => move(key, 1)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="form">
          <Field label="To-dos on the Today card" hint="overdue and soonest first">
            <Select value={prefs.dashboardTodoLimit} onChange={(e) => setPrefs({ dashboardTodoLimit: Number(e.target.value) })}>
              {[5, 8, 10, 15, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n === 100 ? 'Up to 100' : `${n} to-dos`}</option>)}
            </Select>
          </Field>
          <Toggle on={prefs.dashboardTodoUndated} onChange={(dashboardTodoUndated) => setPrefs({ dashboardTodoUndated })} title="Include to-dos without a date" hint="They come after everything that has a date." />
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
                <Input type="number" min={1} max={delayUnit === 'minutes' ? 60 : 3600} inputMode="numeric" value={delayValue} onChange={(e) => { const value = Math.max(1, Number(e.target.value) || 1); setPrefs({ completionDelaySeconds: delayUnit === 'minutes' ? value * 60 : value }); }} />
              </Field>
              <Field label="Unit">
                <Select value={delayUnit} onChange={(e) => setPrefs({ completionDelaySeconds: e.target.value === 'minutes' ? Math.max(60, delayValue * 60) : Math.max(1, delayValue) })}>
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                </Select>
              </Field>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------- Notifications ----------------

function NotificationsSection() {
  const prefs = usePrefs();
  const toast = useToast();
  const n = prefs.notify;
  const supported = notificationsSupported();
  const insecure = notificationsNeedHttps();
  const permission = supported ? Notification.permission : 'denied';
  const on = prefs.notificationsEnabled && permission === 'granted';
  const enable = async () => {
    if (!supported) return toast('This browser does not support notifications');
    const result = await Notification.requestPermission();
    setPrefs({ notificationsEnabled: result === 'granted' });
    toast(result === 'granted' ? 'Notifications are on' : 'Notifications were not allowed');
  };
  return (
    <Card title="Notifications" icon={Bell}>
      <div className="stack" style={{ gap: 14 }}>
        {insecure || !supported ? (
          <p className="notice">
            <TriangleAlert size={16} />
            <span>
              {insecure
                ? 'Browsers only show notifications for apps opened over https:// (or on this computer as localhost). Open Lar through an https address, for example behind Cloudflare Access or a reverse proxy, to turn them on.'
                : 'This browser does not support notifications. On iPhone and iPad, add Lar to the Home Screen first.'}
            </span>
          </p>
        ) : (
          <div className="row wrap">
            {on ? (
              <>
                <span className="row" style={{ gap: 6 }}><ShieldCheck size={18} style={{ color: 'var(--success)' }} /> <b>On for this device</b></span>
                <Button size="sm" onClick={() => notify('Lar', 'Notifications work on this device.', 'lar-test')}>Send a test</Button>
                <Button size="sm" variant="ghost" onClick={() => setPrefs({ notificationsEnabled: false })}>Turn off</Button>
              </>
            ) : (
              <>
                <Button variant="primary" icon={Bell} onClick={enable}>Turn on notifications</Button>
                {permission === 'denied' && <span className="faint" style={{ fontSize: 13 }}>Blocked in the browser's site settings. Allow notifications there first.</span>}
              </>
            )}
          </div>
        )}
        <p className="faint" style={{ fontSize: 12.5 }}>Chosen per device, for the person using it. Lar shows them while it is open in a tab or running as an installed app.</p>

        <div className={cx('stack', !on && 'is-muted')} style={{ gap: 10 }}>
          <Toggle on={n.digest} onChange={(digest) => setNotify({ digest })} title="Morning summary" hint="What is due today and what is overdue, once a day.">
            <Field label="At"><Input type="time" value={n.digestTime} onChange={(e) => e.target.value && setNotify({ digestTime: e.target.value })} /></Field>
          </Toggle>
          <Toggle on={n.dueSoon} onChange={(dueSoon) => setNotify({ dueSoon })} title="To-dos with a time" hint="A reminder before a to-do's time today.">
            <Field label="Remind me">
              <Select value={n.dueLead} onChange={(e) => setNotify({ dueLead: Number(e.target.value) })}>
                <option value={0}>At the time</option>
                <option value={5}>5 minutes before</option>
                <option value={15}>15 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
              </Select>
            </Field>
          </Toggle>
          <Toggle on={n.assigned} onChange={(assigned) => setNotify({ assigned })} title="New to-dos" hint="When someone else adds a to-do for you." />
          <Toggle on={n.shopping} onChange={(shopping) => setNotify({ shopping })} title="Shopping list" hint="When someone else adds to the list. Several additions arrive as one." />
          <Toggle on={n.projects} onChange={(projects) => setNotify({ projects })} title="Project milestones" hint="Milestones reached and projects finished, in projects you are part of." />
          <Toggle on={n.onlyMine} onChange={(onlyMine) => setNotify({ onlyMine })} title="Only things meant for me" hint="Skip new to-dos and shopping items that are for everyone." />
          <Toggle on={!!n.quietStart} onChange={(quiet) => setNotify(quiet ? { quietStart: '21:30', quietEnd: '07:00' } : { quietStart: '', quietEnd: '' })} title="Quiet hours" hint="Nothing arrives during these hours.">
            <div className="form-grid">
              <Field label="From"><Input type="time" value={n.quietStart} onChange={(e) => e.target.value && setNotify({ quietStart: e.target.value })} /></Field>
              <Field label="Until"><Input type="time" value={n.quietEnd} onChange={(e) => e.target.value && setNotify({ quietEnd: e.target.value })} /></Field>
            </div>
          </Toggle>
        </div>
      </div>
    </Card>
  );
}

// ---------------- Agents & API ----------------

function AgentsCard() {
  const { data } = useHousehold();
  const { isAdult } = usePermissions();
  const toast = useToast();
  const origin = window.location.origin;
  const enabled = !!data?.settings.agent_access;
  const setAccess = useInvalidatingMutation((agent_access: boolean) => api.updateSettings({ agent_access }), ['household']);
  return (
    <Card title="Agents & API" icon={Bot}>
      <div className="stack" style={{ gap: 14 }}>
        <Toggle
          on={enabled}
          disabled={!isAdult || setAccess.isPending}
          onChange={async (on) => { await setAccess.mutateAsync(on); toast(on ? 'Agent access is on' : 'Agent access is off'); }}
          title="Let AI agents and scripts use Lar"
          hint={isAdult ? 'Off by default. When on, Hermes Agent, Claude, or any Model Context Protocol client on your network can read and change to-dos, shopping, projects, and recipes.' : 'An adult can turn this on or off.'}
        />
        {enabled ? (
          <>
            <div>
              <b style={{ fontSize: 14 }}>MCP address</b>
              <code className="mono code-box">{origin}/mcp</code>
              <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Send an <code className="mono">X-Lar-Agent</code> header with the agent's name so the activity log shows who did what. Set <code className="mono">LAR_API_KEY</code> on the server to require a key as well.</p>
            </div>
            <div>
              <b style={{ fontSize: 14 }}>REST API for scripts</b>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Everything the app does is available as JSON. Open the address for a map of all routes, and send <code className="mono">X-Lar-Agent</code> from scripts.</p>
              <code className="mono code-box">{origin}/api/v1</code>
            </div>
          </>
        ) : (
          <p className="faint" style={{ fontSize: 13 }}>While this is off, the MCP address and anything that identifies itself as an agent are refused. The Lar app on your devices keeps working as usual.</p>
        )}
      </div>
    </Card>
  );
}
