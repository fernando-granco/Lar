import { CalendarDays, Repeat, AlignLeft, Hammer, Flag } from 'lucide-react';
import { useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { api } from '@/lib/api';
import { friendlyDate, dueTone } from '@/lib/format';
import { CheckBox, AvatarStack, cx } from './ui';
import type { Task } from '@shared/types';

export function TaskRow({ task, onOpen, projectName, showAssignees = true }: { task: Task; onOpen: (t: Task) => void; projectName?: string; showAssignees?: boolean }) {
  const { data: household } = useHousehold();
  const done = task.status === 'done';
  const toggle = useInvalidatingMutation(() => (done ? api.reopenTask(task.id) : api.completeTask(task.id)), ['tasks', 'project', 'projects', 'summary']);
  const tone = dueTone(task.due_date, done);
  return (
    <div className={cx('rowitem', done && 'done')} onClick={() => onOpen(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}>
      <CheckBox on={done} onToggle={() => toggle.mutate(undefined as never)} />
      <div className="body">
        <div className="title">{task.title}</div>
        <div className="meta">
          {task.due_date && (
            <span className={cx('due', tone)}>
              <CalendarDays />
              {tone === 'overdue' ? `Overdue · ${friendlyDate(task.due_date)}` : friendlyDate(task.due_date)}
              {task.due_time && ` · ${task.due_time}`}
            </span>
          )}
          {task.recurrence && <Repeat aria-label="Repeats" />}
          {task.notes && <AlignLeft aria-label="Has notes" />}
          {projectName && (
            <span className="row" style={{ gap: 4 }}>
              <Hammer />
              {projectName}
            </span>
          )}
          {(task.priority === 'high' || task.priority === 'urgent') && (
            <span className={cx('row', task.priority === 'urgent' ? 'error' : '')} style={{ gap: 4, color: task.priority === 'urgent' ? 'var(--danger)' : 'var(--warn)' }}>
              <Flag />
              {task.priority === 'urgent' ? 'Urgent' : 'High'}
            </span>
          )}
        </div>
      </div>
      {showAssignees && household && (
        <div className="side">
          <AvatarStack assignees={task.assignees} members={household.members} groups={household.groups} showEveryone={false} />
        </div>
      )}
    </div>
  );
}
