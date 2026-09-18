import { AlignLeft } from 'lucide-react';
import { useHousehold, useInvalidatingMutation } from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import { CheckBox, AvatarStack, cx } from './ui';
import type { ShoppingItem } from '@shared/types';

export function ShoppingRow({ item, onOpen }: { item: ShoppingItem; onOpen: (i: ShoppingItem) => void }) {
  const { data: household } = useHousehold();
  const checked = !!item.checked_at;
  const toggle = useInvalidatingMutation(() => (checked ? api.uncheckShoppingItem(item.id) : api.checkShoppingItem(item.id)), ['shopping', 'project', 'projects', 'summary']);
  const qty = formatQuantity(item.quantity, item.unit);
  return (
    <div className={cx('rowitem', checked && 'done')} onClick={() => onOpen(item)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}>
      <CheckBox on={checked} round onToggle={() => toggle.mutate(undefined as never)} label={checked ? 'Put back on the list' : 'Mark as picked up'} />
      <div className="body">
        <div className="title row" style={{ gap: 8 }}>
          <span className="truncate">{item.name}</span>
          {qty && <span className="qty">{qty}</span>}
        </div>
        {(item.notes || item.category) && (
          <div className="meta">
            {item.notes && (
              <span className="row" style={{ gap: 4 }}>
                <AlignLeft />
                <span className="truncate" style={{ maxWidth: 240 }}>{item.notes}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {household && (
        <div className="side">
          <AvatarStack assignees={item.assignees} members={household.members} groups={household.groups} showEveryone={false} />
        </div>
      )}
    </div>
  );
}
