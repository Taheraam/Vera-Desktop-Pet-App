import { useEffect, useRef, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Note } from '../shared/types';
import { listNotes, saveNote, deleteNote, onEvent } from '../shared/ipc-client';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1000;

function noteTitle(n: Note): string {
  const first = n.content_markdown.split('\n')[0].replace(/^#+\s*/, '').trim();
  return first || 'Untitled';
}

export function NotesEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const debounceRef = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    let active = true;
    listNotes()
      .then(async (all) => {
        if (!active) return;
        if (all.length === 0) {
          const created = await saveNote({ content_markdown: '' });
          if (!active) return;
          all = [created];
        }
        setNotes(all);
        setActiveId(all[0].id);
        setContent(all[0].content_markdown);
      })
      .catch(() => {
        if (active) setSaveState('error');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    unlisteners.push(
      onEvent('note-updated', (p) => {
        setNotes((prev) => prev.map((n) => (n.id === p.note.id ? p.note : n)));
        if (p.note.id === activeId) {
          setContent((prev) => {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            return prev;
          });
          setContent(p.note.content_markdown);
        }
      }),
    );
    unlisteners.push(
      onEvent('note-deleted', (p) => {
        setNotes((prev) => prev.filter((n) => n.id !== p.id));
        if (activeId === p.id) {
          setActiveId(null);
          setContent('');
        }
      }),
    );
    return () => {
      Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [activeId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const switchNote = (id: number) => {
    if (activeId === null) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setActiveId(id);
    setContent(note.content_markdown);
    setSaveState('idle');
  };

  const handleChange = (value: string) => {
    setContent(value);
    setSaveState('saving');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      if (activeId === null) {
        setSaveState('error');
        return;
      }
      try {
        const updated = await saveNote({ id: activeId, content_markdown: value });
        setSaveState('saved');
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } catch {
        setSaveState('error');
      }
    }, DEBOUNCE_MS);
  };

  const handleNew = async () => {
    try {
      const created = await saveNote({ content_markdown: '' });
      setNotes((prev) => [...prev, created]);
      setActiveId(created.id);
      setContent('');
      setSaveState('idle');
    } catch {
      setSaveState('error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNote(id);
    } catch {
      setSaveState('error');
    }
  };

  const activeNote = notes.find((n) => n.id === activeId);

  return (
    <div className="notes-editor">
      <div className="notes-sidebar">
        <button className="notes-new-btn" onClick={handleNew}>+ New Note</button>
        <ul className="notes-list">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`notes-list-item${n.id === activeId ? ' active' : ''}`}
            >
              <button
                className="notes-list-title"
                onClick={() => switchNote(n.id)}
              >
                {noteTitle(n)}
              </button>
              <button
                className="notes-list-delete"
                onClick={() => handleDelete(n.id)}
                title="Delete note"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="notes-main">
        <div className="notes-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </div>
        {activeNote ? (
          <textarea
            className="notes-textarea"
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write your notes in Markdown…"
          />
        ) : (
          <div className="uw-empty">No note selected.</div>
        )}
      </div>
    </div>
  );
}
