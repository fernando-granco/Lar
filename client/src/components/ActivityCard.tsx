import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import { Card, Empty } from './ui';

export function ActivityCard() {
  const activity = useQuery({ queryKey: keys.activity({ limit: 60 }), queryFn: () => api.activity({ limit: 60 }) });
  return (
    <Card title="Recent activity" icon={Activity} flush>
      {activity.data?.length ? (
        <div className="list">
          {activity.data.map((item) => (
            <div key={item.id} className="activity-row">
              <span><b>{item.actor_name}</b> <span className="muted">{lower(item.summary)}</span></span>
              <span className="when">{timeAgo(item.created_at)}</span>
            </div>
          ))}
        </div>
      ) : activity.isLoading ? null : <Empty icon={Activity} title="Nothing yet" hint="Changes made by people and agents will appear here." />}
    </Card>
  );
}

const lower = (value: string) => (value ? value[0]!.toLowerCase() + value.slice(1) : value);
