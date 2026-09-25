import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, type ShoppingItemInput } from '@/lib/api';
import { useHousehold, useInvalidatingMutation, usePermissions } from '@/lib/hooks';
import { useToast } from './Toast';
import { Sheet, Confirm } from './Sheet';
import { Button, Field, Input, Select, TextArea } from './ui';
import { AssigneePicker } from './AssigneePicker';
import type { ShoppingItem, ShoppingList } from '@shared/types';

export const CATEGORIES = ['Produce', 'Bakery', 'Dairy & eggs', 'Meat & fish', 'Pantry', 'Frozen', 'Drinks', 'Snacks', 'Household', 'Personal care', 'Baby & kids', 'Pets', 'Hardware', 'Garden', 'Other'];

type Draft = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  notes: string;
  price: number | null;
  priority: ShoppingItem['priority'];
  list_id: number;
  assignees: ShoppingItem['assignees'];
};

export function ShoppingItemSheet({ open, onClose, item, listId, lists, defaultMemberIds }: { open: boolean; onClose: () => void; item?: ShoppingItem | null; listId: number; lists?: ShoppingList[]; defaultMemberIds?: number[] }) {
  const { data: household } = useHousehold();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({ name: '', quantity: null, unit: '', category: '', notes: '', price: null, priority: 'normal', list_id: listId, assignees: { member_ids: [], group_ids: [] } });
  const defaultMemberKey = defaultMemberIds?.join(',') ?? '';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (item) {
      const { name, quantity, unit, category, notes, price, priority, list_id, assignees } = item;
      setDraft({ name, quantity, unit, category, notes, price, priority, list_id, assignees });
    } else setDraft({ name: '', quantity: null, unit: '', category: '', notes: '', price: null, priority: 'normal', list_id: listId, assignees: defaultMemberIds?.length ? { member_ids: defaultMemberIds, group_ids: [] } : { member_ids: [], group_ids: [] } });
    setError('');
  }, [open, item, listId, defaultMemberKey]);

  const save = useInvalidatingMutation(async (d: Draft) => {
    const body: ShoppingItemInput = { ...d };
    return item ? api.updateShoppingItem(item.id, body) : api.createShoppingItem({ ...body, name: d.name });
  }, ['shopping', 'project', 'projects', 'summary']);
  const { can } = usePermissions();
  const remove = useInvalidatingMutation(() => api.deleteShoppingItem(item!.id), ['shopping', 'project', 'projects', 'summary']);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError('What is it?');
    try {
      await save.mutateAsync(draft);
      toast(item ? 'Item updated' : 'Added to the list');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={item ? 'Edit item' : 'Add to shopping list'}
        footer={
          <>
            {item && can('shopping', item.created_by) && <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Remove</Button>}
            <Button variant="primary" className="right" type="submit" form="shopping-form" disabled={save.isPending}>
              {item ? 'Save changes' : 'Add item'}
            </Button>
          </>
        }
      >
        <form id="shopping-form" className="form" onSubmit={submit}>
          <Field label="Item">
            <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Oat milk" maxLength={120} />
          </Field>
          <div className="form-grid">
            <Field label="Quantity" hint="optional">
              <div className="row">
                <Input type="number" min={0} step="any" inputMode="decimal" value={draft.quantity ?? ''} onChange={(e) => set({ quantity: e.target.value ? Number(e.target.value) : null })} placeholder="1" style={{ width: 90 }} />
                <Input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="unit (kg, pack…)" maxLength={20} />
              </div>
            </Field>
            <Field label="Aisle / category" hint="optional">
              <Input list="categories" value={draft.category} onChange={(e) => set({ category: e.target.value })} placeholder="Produce, Dairy…" maxLength={40} />
              <datalist id="categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Priority">
              <Select value={draft.priority} onChange={(e) => set({ priority: e.target.value as ShoppingItem['priority'] })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>
          <Field label="Who should pick it up" hint={defaultMemberIds?.length ? 'project members selected automatically' : undefined}>
            <AssigneePicker value={draft.assignees} onChange={(assignees) => set({ assignees })} members={household?.members ?? []} groups={household?.groups ?? []} />
          </Field>
          <div className="form-grid">
            {lists && lists.length > 1 && (
              <Field label="List">
                <Select value={draft.list_id} onChange={(e) => set({ list_id: Number(e.target.value) })}>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Expected price" hint="optional">
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={draft.price ?? ''} onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : null })} placeholder="0.00" />
            </Field>
          </div>
          <Field label="Notes" hint="optional">
            <TextArea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Brand, size, where to find it…" style={{ minHeight: 64 }} />
          </Field>
          {error && <p className="error">{error}</p>}
        </form>
      </Sheet>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this item?"
        body={item?.name}
        confirmLabel="Remove"
        onConfirm={async () => {
          await remove.mutateAsync(undefined as never);
          toast('Item removed');
          onClose();
        }}
      />
    </>
  );
}
