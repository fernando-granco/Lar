import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, type TaskInput } from '@/lib/api';
import { useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { today, addDays } from '@/lib/format';
import { useToast } from './Toast';
import { Sheet, Confirm } from './Sheet';
import { Button, Field, Input, Select, TextArea, Segmented, Chip } from './ui';
import { AssigneePicker } from './AssigneePicker';
import type { Task, Project, Milestone, Recurrence, TaskPriority } from '@shared/types';

type Draft = {
  title: string;
  notes: string;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  recurrence: Recurrence | null;
  project_id: number | null;
  milestone_id: number | null;
  assignees: Task['assignees'];
};

const blank = (init?: Partial<Draft>): Draft => ({
  title: '',
  notes: '',
  priority: 'normal',
  due_date: null,
  due_time: null,
  recurrence: null,
  project_id: null,
  milestone_id: null,
  assignees: { member_ids: [], group_ids: [] },
  ...init,
});

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Create or edit a to-do. Pass `task` to edit. Pass `projects` to allow choosing a project,
 * or `fixedProject` when the sheet lives inside a project page.
 */
export function TaskSheet({
  open,
  onClose,
  task,
  initial,
  projects,
  fixedProject,
  milestones,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  initial?: Partial<Draft>;
  projects?: Project[];
  fixedProject?: { id: number; milestones: Milestone[]; memberIds?: number[] };
  milestones?: Milestone[];
}) {
  const { data: household } = useHousehold();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(blank());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (task) {
      const { title, notes, priority, due_date, due_time, recurrence, project_id, milestone_id, assignees } = task;
      setDraft({ title, notes, priority, due_date, due_time, recurrence, project_id, milestone_id, assignees });
    } else setDraft(blank({ project_id: fixedProject?.id ?? null, assignees: fixedProject?.memberIds?.length ? { member_ids: fixedProject.memberIds, group_ids: [] } : { member_ids: [], group_ids: [] }, ...initial }));
    setError('');
  }, [open, task, initial, fixedProject?.id]);

  const save = useInvalidatingMutation(async (d: Draft) => {
    const body: TaskInput = { ...d };
    if (task) return api.updateTask(task.id, body);
    return api.createTask({ ...body, title: d.title });
  }, ['tasks', 'project', 'projects', 'summary']);
  const remove = useInvalidatingMutation(() => api.deleteTask(task!.id), ['tasks', 'project', 'projects', 'summary']);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError('Give it a title.');
    try {
      await save.mutateAsync(draft);
      toast(task ? 'To-do updated' : 'To-do added');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const t = today();
  const availableMilestones = fixedProject?.milestones ?? milestones ?? [];
  const showProjectSelect = !fixedProject && projects && projects.length > 0;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={task ? 'Edit to-do' : 'New to-do'}
        footer={
          <>
            {task && <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="primary" className="right" type="submit" form="task-form" disabled={save.isPending}>
              {task ? 'Save changes' : 'Add to-do'}
            </Button>
          </>
        }
      >
        <form id="task-form" className="form" onSubmit={submit}>
          <Field label="What needs doing?">
            <Input autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Call the plumber" maxLength={200} />
          </Field>

          <Field label="When">
            <div className="chip-row" style={{ marginBottom: 8 }}>
              <Chip on={draft.due_date === t} onClick={() => set({ due_date: t })}>Today</Chip>
              <Chip on={draft.due_date === addDays(t, 1)} onClick={() => set({ due_date: addDays(t, 1) })}>Tomorrow</Chip>
              <Chip on={draft.due_date === addDays(t, 7)} onClick={() => set({ due_date: addDays(t, 7) })}>Next week</Chip>
              <Chip on={draft.due_date === null} onClick={() => set({ due_date: null, due_time: null })}>No date</Chip>
            </div>
            <div className="form-grid">
              <Input type="date" value={draft.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} />
              <Input type="time" value={draft.due_time ?? ''} onChange={(e) => set({ due_time: e.target.value || null })} disabled={!draft.due_date} aria-label="Time" />
            </div>
          </Field>

          <Field label="For whom" hint={fixedProject?.memberIds?.length ? 'project members selected automatically' : undefined}>
            <AssigneePicker value={draft.assignees} onChange={(assignees) => set({ assignees })} members={household?.members ?? []} groups={household?.groups ?? []} />
          </Field>

          <div className="form-grid">
            <Field label="Priority">
              <Segmented<TaskPriority>
                value={draft.priority}
                onChange={(priority) => set({ priority })}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </Field>
            <Field label="Repeat">
              <Select
                value={draft.recurrence?.freq ?? ''}
                onChange={(e) => {
                  const freq = e.target.value as Recurrence['freq'] | '';
                  set({ recurrence: freq ? { freq, interval: 1, weekdays: freq === 'weekly' ? draft.recurrence?.weekdays : undefined } : null });
                }}
              >
                <option value="">Never</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </Select>
            </Field>
          </div>

          {draft.recurrence && (
            <div className="row wrap">
              <span className="muted" style={{ fontSize: 13 }}>Every</span>
              <Input
                type="number"
                min={1}
                max={365}
                style={{ width: 72 }}
                value={draft.recurrence.interval}
                onChange={(e) => set({ recurrence: { ...draft.recurrence!, interval: Math.max(1, Number(e.target.value) || 1) } })}
              />
              <span className="muted" style={{ fontSize: 13 }}>
                {{ daily: 'day(s)', weekly: 'week(s) on', monthly: 'month(s)', yearly: 'year(s)' }[draft.recurrence.freq]}
              </span>
              {draft.recurrence.freq === 'weekly' && (
                <div className="chip-row">
                  {WEEKDAYS.map((d, i) => {
                    const on = draft.recurrence!.weekdays?.includes(i) ?? false;
                    return (
                      <Chip
                        key={i}
                        on={on}
                        style={{ width: 34, justifyContent: 'center', padding: 0 }}
                        onClick={() => {
                          const cur = new Set(draft.recurrence!.weekdays ?? []);
                          on ? cur.delete(i) : cur.add(i);
                          set({ recurrence: { ...draft.recurrence!, weekdays: [...cur].sort() } });
                        }}
                      >
                        {d}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(showProjectSelect || availableMilestones.length > 0) && (
            <div className="form-grid">
              {showProjectSelect && (
                <Field label="Project" hint="optional">
                  <Select value={draft.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value ? Number(e.target.value) : null, milestone_id: null })}>
                    <option value="">None (household to-do)</option>
                    {projects!.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {availableMilestones.length > 0 && (
                <Field label="Milestone" hint="optional">
                  <Select value={draft.milestone_id ?? ''} onChange={(e) => set({ milestone_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">None</option>
                    {availableMilestones.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          )}

          <Field label="Notes" hint="optional">
            <TextArea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything useful to remember" />
          </Field>
          {error && <p className="error">{error}</p>}
        </form>
      </Sheet>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this to-do?"
        body={task?.title}
        onConfirm={async () => {
          await remove.mutateAsync(undefined as never);
          toast('To-do deleted');
          onClose();
        }}
      />
    </>
  );
}
