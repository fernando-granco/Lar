import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShoppingBasket } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useInvalidatingMutation } from '@/lib/hooks';
import { parseShoppingText } from '@shared/parse';
import type { ShoppingPriority } from '@shared/types';
import { Sheet } from './Sheet';
import { Button, Field, Input, Segmented, Select } from './ui';
import { useToast } from './Toast';

/** A two-tap shopping capture available from every mobile screen. */
export function MobileQuickShopping() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<ShoppingPriority>('normal');
  const [listId, setListId] = useState(1);
  const toast = useToast();
  const listsQ = useQuery({ queryKey: keys.shoppingLists, queryFn: api.shoppingLists, enabled: open });
  const add = useInvalidatingMutation(async () => {
    const parsed = parseShoppingText(name);
    return api.createShoppingItem({ list_id: listId, ...parsed, priority: parsed.priority ?? priority });
  }, ['shopping', 'summary']);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPriority('normal');
  }, [open]);

  useEffect(() => {
    const available = listsQ.data?.filter((list) => !list.project_id) ?? [];
    if (available.length && !available.some((list) => list.id === listId)) setListId(available[0]!.id);
  }, [listId, listsQ.data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await add.mutateAsync(undefined as never);
    toast('Added to shopping');
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="btn btn-secondary mobile-shop-button hide-desktop" onClick={() => setOpen(true)} aria-label="Quick add to shopping list" title="Add to shopping">
        <ShoppingBasket /><Plus className="plus" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Quick add to shopping"
        footer={<Button variant="primary" className="right" type="submit" form="mobile-shopping-form" disabled={!name.trim() || add.isPending}>Add item</Button>}
      >
        <form id="mobile-shopping-form" className="form" onSubmit={submit}>
          <Field label="What do you need?">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Milk, bananas, detergent…" enterKeyHint="done" maxLength={120} />
          </Field>
          <Field label="Priority">
            <Segmented<ShoppingPriority>
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
          </Field>
          {(listsQ.data?.length ?? 0) > 1 && (
            <Field label="Shopping list">
              <Select value={listId} onChange={(e) => setListId(Number(e.target.value))}>
                {listsQ.data!.filter((l) => !l.project_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
          <p className="faint" style={{ fontSize: 12.5 }}>Tip: “2x oat milk !urgent” also understands quantity and priority.</p>
        </form>
      </Sheet>
    </>
  );
}
