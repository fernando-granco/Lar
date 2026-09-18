import { Users } from 'lucide-react';
import { Avatar, Chip } from './ui';
import type { Assignees, Member, Group } from '@shared/types';

/** Pick who something is for: everyone, specific people, or groups. Empty = everyone. */
export function AssigneePicker({ value, onChange, members, groups }: { value: Assignees; onChange: (a: Assignees) => void; members: Member[]; groups: Group[] }) {
  const everyone = !value.member_ids.length && !value.group_ids.length;
  const toggle = (kind: 'member_ids' | 'group_ids', id: number) => {
    const set = new Set(value[kind]);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange({ ...value, [kind]: [...set] });
  };
  return (
    <div className="assignee-picker">
      <Chip on={everyone} icon={Users} onClick={() => onChange({ member_ids: [], group_ids: [] })}>
        Everyone
      </Chip>
      {groups.map((g) => (
        <Chip key={`g${g.id}`} on={value.group_ids.includes(g.id)} onClick={() => toggle('group_ids', g.id)}>
          <Avatar member={{ name: g.name, color: g.color, initials: g.name.slice(0, 2).toUpperCase() }} size="sm" group />
          {g.name}
        </Chip>
      ))}
      {members.map((m) => (
        <Chip key={m.id} on={value.member_ids.includes(m.id)} onClick={() => toggle('member_ids', m.id)}>
          <Avatar member={m} size="sm" />
          {m.name}
        </Chip>
      ))}
    </div>
  );
}
