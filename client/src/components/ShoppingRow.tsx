import { AlignLeft, Flag } from 'lucide-react';
import { useHousehold } from '@/lib/hooks';
import { useDeferredCompletion } from '@/lib/completion';
import { formatQuantity } from '@/lib/format';
import { CheckBox, AvatarStack, cx } from './ui';
import type { ShoppingItem } from '@shared/types';

export function ShoppingRow({ item, onOpen }: { item: ShoppingItem; onOpen: (i: ShoppingItem) => void }) {
  const { data: household } = useHousehold();
  const checked = !!item.checked_at;
  const completion = useDeferredCompletion('shopping', item.id, checked);
  const qty = formatQuantity(item.quantity, item.unit);
  return (
    <div className={cx('rowitem', completion.checked && 'done', completion.pending && 'pending-done')} onClick={() => onOpen(item)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}>
      <CheckBox on={completion.checked} round onToggle={() => void completion.toggle()} label={completion.checked ? 'Put back on the list' : 'Mark as picked up'} />
      <div className="body">
        <div className="title row" style={{ gap: 8 }}>
          <span className="truncate">{item.name}</span>
          {qty && <span className="qty">{qty}</span>}
        </div>
        {(item.notes || item.category || item.priority === 'high' || item.priority === 'urgent') && (
          <div className="meta">
            {(item.priority === 'high' || item.priority === 'urgent') && (
              <span className={cx('row', item.priority === 'urgent' ? 'error' : '')} style={{ gap: 4, color: item.priority === 'urgent' ? 'var(--danger)' : 'var(--warn)' }}>
                <Flag /> {item.priority === 'urgent' ? 'Urgent' : 'High'}
              </span>
            )}
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
