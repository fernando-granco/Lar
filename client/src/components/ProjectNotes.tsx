import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pin, Lock, Sun, LayoutGrid, Trash2, Users, UserRound, StickyNote } from 'lucide-react';
import { api, type NoteInput } from '@/lib/api';
import { keys, useCurrentMember, useHousehold, usePermissions } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import { Sheet, Confirm } from './Sheet';
import { Avatar, Button, Card, Chip, Empty, Input, Segmented, TextArea, cx } from './ui';
import { useToast } from './Toast';
import type { ProjectDetail, ProjectNote } from '@shared/types';

const NOTE_COLORS = ['', '#c8913a', '#5e8f5a', '#3f6f9e', '#7c6f9b', '#a4494f', '#db744f'];

type Draft = Required<Pick<NoteInput, 'title' | 'body' | 'color' | 'pinned' | 'show_on_overview' | 'show_on_today' | 'member_ids'>>;
const blank = (): Draft => ({ title: '', body: '', color: '', pinned: false, show_on_overview: true, show_on_today: false, member_ids: [] });
const toDraft = (n: ProjectNote): Draft => ({ title: n.title, body: n.body, color: n.color, pinned: n.pinned, show_on_overview: n.show_on_overview, show_on_today: n.show_on_today, member_ids: n.member_ids });

/** A note tile. Tapping it opens the editor. */
export function NoteCard({ note, onOpen, compact }: { note: ProjectNote; onOpen: (n: ProjectNote) => void; compact?: boolean }) {
  const { data: household } = useHousehold();
  const me = useCurrentMember();
  const people = household?.members.filter((m) => note.member_ids.includes(m.id)) ?? [];
  const privateLabel = note.member_ids.length === 1 && note.member_ids[0] === me?.id ? 'Only you' : people.map((m) => m.name).join(', ');
  return (
    <button type="button" className={cx('note-card', compact && 'compact')} style={{ borderTopColor: note.color || undefined }} onClick={() => onOpen(note)}>
      <div className="note-card-head">
        {note.pinned && <Pin size={13} aria-label="Pinned" />}
        <b className="truncate">{note.title || 'Untitled note'}</b>
      </div>
      {note.body ? <p className={cx('note-body', 'clamp', compact && 'short')}>{note.body}</p> : <p className="note-body faint">Empty note</p>}
      <span className="note-foot">
        {note.member_ids.length > 0 && <span className="row" style={{ gap: 3 }}><Lock size={12} /> {privateLabel}</span>}
        {note.show_on_today && <span className="row" style={{ gap: 3 }}><Sun size={12} /> On Today</span>}
        <span className="right">{timeAgo(note.updated_at)}</span>
      </span>
    </button>
  );
}

/**
 * Create or edit a note. Typing only changes local state; an existing note
 * saves itself shortly after you stop typing and again when the sheet
 * closes, and never gets overwritten by the refresh its own save triggers.
 */
export function NoteEditor({ project, note, open, onClose }: { project: ProjectDetail; note: ProjectNote | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useCurrentMember();
  const { can } = usePermissions();
  const { data: household } = useHousehold();
  const [draft, setDraft] = useState<Draft>(blank());
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteId = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    if (!open) return;
    noteId.current = note?.id ?? null;
    setDraft(note ? toDraft(note) : blank());
    setStatus('saved');
    // Only when the sheet opens: later refreshes of `note` must not replace what is being typed.
  }, [open, note?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.project(project.id) });
    qc.invalidateQueries({ queryKey: keys.todayNotes });
  };

  const persist = async () => {
    window.clearTimeout(timer.current);
    if (noteId.current === null) return;
    setStatus('saving');
    try {
      await api.updateNote(noteId.current, latest.current);
      setStatus((s) => (s === 'saving' ? 'saved' : s));
    } catch (err) {
      setStatus('error');
      toast((err as Error).message);
    }
  };

  const change = (patch: Partial<Draft>, immediate = false) => {
    latest.current = { ...latest.current, ...patch };
    setDraft(latest.current);
    if (noteId.current === null) return;
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), immediate ? 0 : 1200);
  };

  const close = async () => {
    if (noteId.current !== null && status !== 'saved') await persist();
    refresh();
    onClose();
  };

  const create = async () => {
    try {
      await api.createNote(project.id, draft);
      refresh();
      toast('Note added');
      onClose();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const visibility: 'everyone' | 'me' | 'people' = !draft.member_ids.length ? 'everyone' : draft.member_ids.length === 1 && draft.member_ids[0] === me?.id ? 'me' : 'people';
  const editable = !note || can('projects', note.created_by);
  const statusText = { saved: 'Saved', dirty: 'Editing…', saving: 'Saving…', error: 'Not saved' }[status];

  return (
    <>
      <Sheet
        open={open}
        onClose={() => void close()}
        wide
        title={note ? (editable ? 'Edit note' : 'Note') : 'New note'}
        footer={
          note ? (
            <>
              {editable && <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
              <span className={cx('faint', 'right', status === 'error' && 'error')} style={{ fontSize: 13 }}>{editable ? statusText : 'Only its author or an adult can change it'}</span>
              <Button variant="primary" onClick={() => void close()}>Done</Button>
            </>
          ) : (
            <Button variant="primary" className="right" disabled={!draft.title.trim() && !draft.body.trim()} onClick={() => void create()}>Add note</Button>
          )
        }
      >
        <fieldset className="form note-editor" disabled={!editable}>
          <Input value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder="Title" maxLength={160} className="note-title-input" autoFocus={!note} aria-label="Note title" />
          <TextArea value={draft.body} onChange={(e) => change({ body: e.target.value })} placeholder="Measurements, ideas, supplier phone numbers, paint codes…" className="note-body-input" aria-label="Note text" />

          <div className="note-options">
            <div className="field">
              <span>Colour</span>
              <div className="color-dots" role="radiogroup" aria-label="Colour">
                {NOTE_COLORS.map((c) => (
                  <button key={c || 'none'} type="button" role="radio" aria-checked={draft.color === c} aria-label={c || 'No colour'} className={cx(draft.color === c && 'on', !c && 'none')} style={{ background: c || undefined }} onClick={() => change({ color: c }, true)} />
                ))}
              </div>
            </div>
            <div className="field">
              <span>Where it shows</span>
              <div className="chip-row">
                <Chip icon={Pin} on={draft.pinned} onClick={() => change({ pinned: !draft.pinned }, true)}>Pinned to the top</Chip>
                <Chip icon={LayoutGrid} on={draft.show_on_overview} onClick={() => change({ show_on_overview: !draft.show_on_overview }, true)}>Project overview</Chip>
                <Chip icon={Sun} on={draft.show_on_today} onClick={() => change({ show_on_today: !draft.show_on_today }, true)}>Today screen</Chip>
              </div>
              <p className="faint" style={{ fontSize: 12 }}>Every note is always on the project's Notes tab. “Today screen” shows it on the dashboard of everyone who can see it.</p>
            </div>
            <div className="field">
              <span>Who can see it</span>
              <Segmented<'everyone' | 'me' | 'people'>
                value={visibility}
                onChange={(v) => change({ member_ids: v === 'everyone' ? [] : v === 'me' ? (me ? [me.id] : []) : draft.member_ids.length ? draft.member_ids : me ? [me.id] : [] }, true)}
                options={[
                  { value: 'everyone', label: <span className="row" style={{ gap: 5 }}><Users size={14} /> Everyone</span> },
                  { value: 'me', label: <span className="row" style={{ gap: 5 }}><UserRound size={14} /> Only me</span> },
                  { value: 'people', label: 'Choose' },
                ]}
              />
              {visibility === 'people' && (
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {household?.members.map((m) => {
                    const on = draft.member_ids.includes(m.id);
                    return (
                      <Chip key={m.id} on={on} onClick={() => change({ member_ids: on ? draft.member_ids.filter((x) => x !== m.id) : [...draft.member_ids, m.id] }, true)}>
                        <Avatar member={m} size="sm" /> {m.name}
                      </Chip>
                    );
                  })}
                </div>
              )}
              {visibility !== 'everyone' && <p className="faint" style={{ fontSize: 12 }}>Whoever writes a note can always see it. Agents connected to Lar can read every note.</p>}
            </div>
          </div>
        </fieldset>
      </Sheet>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this note?"
        body={draft.title || 'This note'}
        onConfirm={async () => {
          if (noteId.current === null) return;
          window.clearTimeout(timer.current);
          await api.deleteNote(noteId.current);
          noteId.current = null;
          refresh();
          toast('Note deleted');
          onClose();
        }}
      />
    </>
  );
}

/** The project's Notes tab: every note the viewer can see, as a board. */
export function NotesBoard({ project }: { project: ProjectDetail }) {
  const [editing, setEditing] = useState<ProjectNote | 'new' | null>(null);
  const notes = project.project_notes;
  return (
    <>
      <Card title="Notes" icon={StickyNote} action={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>New note</Button>}>
        {notes.length ? (
          <div className="notes-board">{notes.map((n) => <NoteCard key={n.id} note={n} onOpen={setEditing} />)}</div>
        ) : (
          <Empty icon={StickyNote} title="No notes yet" hint="Keep measurements, ideas, and phone numbers here. Add as many notes as you like." />
        )}
      </Card>
      <NoteEditor project={project} note={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}
