import { useEffect, useState } from 'react';
import { api, type ProjectInput } from '@/lib/api';
import { useHousehold, useCurrentMember, useInvalidatingMutation } from '@/lib/hooks';
import { useToast } from './Toast';
import { Sheet } from './Sheet';
import { Button, Field, Input, Select, TextArea, Segmented, ColorDots, Chip, Avatar } from './ui';
import { PROJECT_ICONS, ProjectIcon } from './ProjectIcon';
import type { Project, ProjectStatus, ProjectPriority } from '@shared/types';

type Draft = {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  color: string;
  icon: string;
  owner_id: number | null;
  member_ids: number[];
  start_date: string | null;
  target_date: string | null;
  budget: number | null;
};

const TEMPLATES = [
  { id: '', label: 'Start from scratch', patch: {} },
  { id: 'repair', label: 'Home repair', patch: { name: 'Home repair', description: 'Plan the repair, parts, and work needed.', icon: 'hammer', color: '#db744f' } },
  { id: 'vacation', label: 'Vacation', patch: { name: 'Vacation', description: 'Bookings, packing, and the things to do before we go.', icon: 'plane', color: '#3f6f9e' } },
  { id: 'party', label: 'Party', patch: { name: 'Party', description: 'Guest list, food, supplies, and the plan for the day.', icon: 'sparkles', color: '#7c6f9b' } },
  { id: 'renovation', label: 'Renovation', patch: { name: 'Renovation', description: 'A room-by-room plan, budget, and materials.', icon: 'home', color: '#c8913a' } },
  { id: 'landscaping', label: 'Landscaping', patch: { name: 'Landscaping', description: 'Outdoor jobs, plants, materials, and seasonal care.', icon: 'leaf', color: '#5e8f5a' } },
  { id: 'school', label: 'Back to School', patch: { name: 'Back to School', description: 'Supplies, forms, clothes, and first-week reminders.', icon: 'backpack', color: '#3f6f9e' } },
] as const;

export function ProjectSheet({ open, onClose, project, onCreated }: { open: boolean; onClose: () => void; project?: Project | null; onCreated?: (id: number) => void }) {
  const { data: household } = useHousehold();
  const me = useCurrentMember();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(blank(me?.id ?? null));
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (!open) return;
    if (project) {
      const { name, description, status, priority, color, icon, owner_id, member_ids, start_date, target_date, budget } = project;
      setDraft({ name, description, status, priority, color, icon, owner_id, member_ids, start_date, target_date, budget });
    } else setDraft(blank(me?.id ?? null));
    setTemplate('');
    setError('');
  }, [open, project, me?.id]);

  const save = useInvalidatingMutation(async (d: Draft) => {
    const body: ProjectInput = { ...d };
    return project ? api.updateProject(project.id, body) : api.createProject({ ...body, name: d.name });
  }, ['projects', 'project', 'shopping', 'summary']);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError('Give the project a name.');
    try {
      const result = await save.mutateAsync(draft);
      toast(project ? 'Project updated' : 'Project created');
      onClose();
      if (!project && onCreated) onCreated(result.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const members = household?.members ?? [];
  const currency = household?.settings.currency ?? 'USD';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      wide
      footer={
        <Button variant="primary" className="right" type="submit" form="project-form" disabled={save.isPending}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      }
    >
      <form id="project-form" className="form" onSubmit={submit}>
        {!project && <Field label="Start with a template" hint="optional"><Select value={template} onChange={(e) => { const value = e.target.value; setTemplate(value); const selected = TEMPLATES.find((item) => item.id === value); if (selected) setDraft((current) => ({ ...current, ...selected.patch })); }}>{TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <ProjectIcon icon={draft.icon} color={draft.color} size="lg" />
          <Field label="Project name" className="grow">
            <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Backyard refresh" maxLength={120} />
          </Field>
        </div>
        <Field label="What is it about?" hint="optional">
          <TextArea value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="A sentence or two so everyone knows the goal" style={{ minHeight: 64 }} />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })}>
              <option value="idea">Idea</option>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="done">Done</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Segmented<ProjectPriority> value={draft.priority} onChange={(priority) => set({ priority })} options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} />
          </Field>
          <Field label="Start date" hint="optional">
            <Input type="date" value={draft.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} />
          </Field>
          <Field label="Target date" hint="optional">
            <Input type="date" value={draft.target_date ?? ''} onChange={(e) => set({ target_date: e.target.value || null })} />
          </Field>
          <Field label={`Budget (${currency})`} hint="optional">
            <Input type="number" min={0} step="0.01" inputMode="decimal" value={draft.budget ?? ''} onChange={(e) => set({ budget: e.target.value ? Number(e.target.value) : null })} placeholder="0" />
          </Field>
          <Field label="Owner">
            <Select value={draft.owner_id ?? ''} onChange={(e) => set({ owner_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Who's involved">
          <div className="chip-row">
            {members.map((m) => {
              const on = draft.member_ids.includes(m.id);
              return (
                <Chip key={m.id} on={on} onClick={() => set({ member_ids: on ? draft.member_ids.filter((x) => x !== m.id) : [...draft.member_ids, m.id] })}>
                  <Avatar member={m} size="sm" />
                  {m.name}
                </Chip>
              );
            })}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="Color">
            <ColorDots value={draft.color} onChange={(color) => set({ color })} />
          </Field>
          <Field label="Icon">
            <div className="chip-row">
              {PROJECT_ICONS.map((name) => (
                <Chip key={name} on={draft.icon === name} onClick={() => set({ icon: name })} style={{ padding: '4px 8px' }} aria-label={name}>
                  <ProjectIcon icon={name} color="transparent" size="chip" />
                </Chip>
              ))}
            </div>
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </Sheet>
  );
}

function blank(owner: number | null): Draft {
  return { name: '', description: '', status: 'planned', priority: 'normal', color: '#db744f', icon: 'hammer', owner_id: owner, member_ids: owner ? [owner] : [], start_date: null, target_date: null, budget: null };
}
