import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShoppingBasket, Sparkles, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { keys, useCurrentMember, useInvalidatingMutation } from '@/lib/hooks';
import { usePrefs, setPrefs } from '@/lib/store';
import { parseShoppingText } from '@shared/parse';
import { Card, Button, Empty, Segmented, Chip, Field, Input } from '@/components/ui';
import { Sheet, Confirm } from '@/components/Sheet';
import { ShoppingRow } from '@/components/ShoppingRow';
import { ShoppingItemSheet } from '@/components/ShoppingItemSheet';
import { useToast } from '@/components/Toast';
import type { ShoppingItem, ShoppingList, ShoppingPriority } from '@shared/types';

export function Shopping() {
  const me = useCurrentMember();
  const { view } = usePrefs();
  const toast = useToast();
  const mine = view === 'mine' && !!me;
  const listsQ = useQuery({ queryKey: keys.shoppingLists, queryFn: api.shoppingLists });
  const [listId, setListId] = useState(1);
  const itemsQ = useQuery({ queryKey: keys.shoppingItems({ list: listId, member: mine ? me!.id : undefined }), queryFn: () => api.shoppingItems({ list: listId, member: mine ? me!.id : undefined }) });
  const [edit, setEdit] = useState<ShoppingItem | null | 'new'>(null);
  const [quick, setQuick] = useState('');
  const [quickPriority, setQuickPriority] = useState<ShoppingPriority>('normal');
  const [focused, setFocused] = useState(false);
  const suggQ = useQuery({ queryKey: ['shopping', 'suggestions', quick], queryFn: () => api.shoppingSuggestions(quick || undefined), enabled: focused });
  const [listSheet, setListSheet] = useState<'new' | ShoppingList | null>(null);
  const [listName, setListName] = useState('');
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);

  const create = useInvalidatingMutation(({ text, priority }: { text: string; priority?: ShoppingPriority }) => {
    const parsed = parseShoppingText(text);
    return api.createShoppingItem({ list_id: listId, ...parsed, priority: parsed.priority ?? priority ?? 'normal' });
  }, ['shopping', 'summary']);
  const clear = useInvalidatingMutation(() => api.clearChecked(listId), ['shopping', 'summary']);
  const saveList = useInvalidatingMutation((name: string) => (listSheet === 'new' ? api.createShoppingList(name) : api.renameShoppingList((listSheet as ShoppingList).id, name)), ['shopping']);
  const deleteList = useInvalidatingMutation(() => api.deleteShoppingList(listId), ['shopping', 'summary']);

  const lists = listsQ.data ?? [];
  const current = lists.find((l) => l.id === listId) ?? lists[0];
  const items = itemsQ.data ?? [];
  const grouped = useMemo(() => {
    const open = items.filter((i) => !i.checked_at);
    const byCat = new Map<string, ShoppingItem[]>();
    for (const i of open) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
    const cats = [...byCat.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    return { cats: cats.map((c) => ({ name: c, items: byCat.get(c)! })), checked: items.filter((i) => !!i.checked_at), openCount: open.length };
  }, [items]);
  const openNames = new Set(items.filter((i) => !i.checked_at).map((i) => i.name.toLowerCase()));
  const suggestions = (suggQ.data ?? []).filter((s) => !openNames.has(s.name.toLowerCase())).slice(0, 8);

  const submitQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    setQuick('');
    await create.mutateAsync({ text, priority: quickPriority });
    setQuickPriority('normal');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Shopping</h1>
          <p className="sub">{grouped.openCount ? `${grouped.openCount} to pick up` : 'Nothing to pick up'}{current && current.id !== 1 ? ` · ${current.name}` : ''}</p>
        </div>
        <div className="row">
          {me && <Segmented<'everyone' | 'mine'> value={mine ? 'mine' : 'everyone'} onChange={(v) => setPrefs({ view: v })} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'Only mine' }]} />}
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')} className="hide-mobile">Add item</Button>
        </div>
      </header>

      {lists.length > 1 && (
        <div className="chip-row scroll">
          {lists.map((l) => (
            <Chip key={l.id} on={l.id === listId} onClick={() => setListId(l.id)}>
              {l.name}
              {!!l.open_count && <span className="mono" style={{ opacity: 0.7 }}>{l.open_count}</span>}
            </Chip>
          ))}
          <Chip icon={Plus} onClick={() => { setListName(''); setListSheet('new'); }} aria-label="New list" />
        </div>
      )}

      <div>
        <form className="quick-add" onSubmit={submitQuick}>
          <Sparkles />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Add an item… try “2x oat milk” or “1 kg apples”"
            aria-label="Quick add item"
            enterKeyHint="done"
            autoComplete="off"
          />
          <span className="hint">Enter to add</span>
          <Button variant="primary" size="sm" type="submit" disabled={!quick.trim()}>Add</Button>
        </form>
        <div className="quick-options">
          <span>Priority</span>
          <Segmented<ShoppingPriority>
            value={quickPriority}
            onChange={setQuickPriority}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'low', label: 'Low' },
            ]}
          />
        </div>
        {focused && suggestions.length > 0 && (
          <div className="chip-row" style={{ marginTop: 8 }}>
            {suggestions.map((s) => (
              <Chip key={s.name} onMouseDown={(e) => e.preventDefault()} onClick={() => create.mutate({ text: s.name, priority: quickPriority })}>
                <Plus /> {s.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <Card
        flush
        title={current?.name ?? 'Shopping list'}
        icon={ShoppingBasket}
        action={
          lists.length <= 1 ? (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => { setListName(''); setListSheet('new'); }}>New list</Button>
          ) : current && current.id !== 1 && !current.project_id ? (
            <div className="row" style={{ gap: 2 }}>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setListName(current.name); setListSheet(current); }}>Rename</Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDeleteList(true)}>Delete</Button>
            </div>
          ) : (
            <MoreHorizontal size={16} className="faint" style={{ opacity: 0 }} />
          )
        }
      >
        {itemsQ.isLoading ? null : grouped.openCount ? (
          grouped.cats.map((c) => (
            <div className="list-section" key={c.name || '_'}>
              {(c.name || grouped.cats.length > 1) && <header>{c.name || 'Items'} <span className="n">{c.items.length}</span></header>}
              <div className="list">{c.items.map((i) => <ShoppingRow key={i.id} item={i} onOpen={setEdit} />)}</div>
            </div>
          ))
        ) : (
          <Empty icon={ShoppingBasket} title="The list is empty" hint="Type something above to add it." />
        )}
        {grouped.checked.length > 0 && (
          <div className="list-section">
            <header>
              Picked up <span className="n">{grouped.checked.length}</span>
              <Button size="sm" variant="ghost" className="right" onClick={() => clear.mutate(undefined as never)}>Clear</Button>
            </header>
            <div className="list">{grouped.checked.map((i) => <ShoppingRow key={i.id} item={i} onOpen={setEdit} />)}</div>
          </div>
        )}
      </Card>

      <button type="button" className="fab" aria-label="Add item" onClick={() => setEdit('new')}><Plus /></button>
      <ShoppingItemSheet open={edit !== null} onClose={() => setEdit(null)} item={edit === 'new' ? null : edit} listId={listId} lists={lists} />

      <Sheet
        open={listSheet !== null}
        onClose={() => setListSheet(null)}
        title={listSheet === 'new' ? 'New shopping list' : 'Rename list'}
        footer={
          <Button
            variant="primary"
            className="right"
            disabled={!listName.trim()}
            onClick={async () => {
              const l = await saveList.mutateAsync(listName.trim());
              setListSheet(null);
              if (l) setListId(l.id);
              toast(listSheet === 'new' ? 'List created' : 'List renamed');
            }}
          >
            {listSheet === 'new' ? 'Create list' : 'Save'}
          </Button>
        }
      >
        <Field label="Name">
          <Input autoFocus value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Hardware store, Costco run" maxLength={60} onKeyDown={(e) => e.key === 'Enter' && listName.trim() && (e.preventDefault(), saveList.mutateAsync(listName.trim()).then((l) => { setListSheet(null); if (l) setListId(l.id); }))} />
        </Field>
      </Sheet>
      <Confirm
        open={confirmDeleteList}
        onClose={() => setConfirmDeleteList(false)}
        title={`Delete "${current?.name}"?`}
        body="Everything on this list will be removed too."
        onConfirm={async () => {
          await deleteList.mutateAsync(undefined as never);
          setListId(1);
          toast('List deleted');
        }}
      />
    </div>
  );
}
