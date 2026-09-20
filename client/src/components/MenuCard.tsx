import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Coffee, Soup, Utensils } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/hooks';
import { today } from '@/lib/format';
import { Card, Empty } from './ui';

const LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' } as const;
const ICONS = { breakfast: Coffee, lunch: Soup, dinner: Utensils } as const;

export function MenuCard() {
  const date = today();
  const menuQ = useQuery({ queryKey: keys.menu({ from: date, to: date }), queryFn: () => api.menu(date, date) });
  return (
    <Card title="Today's menu" icon={Utensils} flush action={<Link to="/recipes" className="btn btn-ghost btn-sm">Weekly menu</Link>}>
      {menuQ.isLoading ? null : menuQ.data?.length ? (
        <div className="list">
          {menuQ.data.map((entry) => {
            const Icon = ICONS[entry.meal_type];
            return (
              <div className="rowitem" key={entry.id} style={{ cursor: 'default' }}>
                <Icon size={18} className="faint" />
                <div className="body">
                  <div className="title">{entry.recipe_name || entry.custom_title}</div>
                  <div className="meta">{LABELS[entry.meal_type]}{entry.notes ? ` · ${entry.notes}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={Utensils} title="Nothing planned today" hint="Open the weekly menu to choose meals." />
      )}
    </Card>
  );
}
