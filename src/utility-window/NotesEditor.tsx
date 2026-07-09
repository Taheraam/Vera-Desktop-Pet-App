import { useEffect, useRef, useState } from 'react';
import type { Note } from '../shared/types';
import { listNotes, saveNote } from '../shared/ipc-client';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1000;

export function NotesEditor() {
  const [content, setContent] = useState('');
  const noteIdRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    let active = true;
    listNotes()
      .then(async (notes) => {
        if (!active) return;
        if (notes.length > 0) {
          noteIdRef.current = notes[0].id;
          setContent(notes[0].content_markdown);
        } else {
          const created: Note = await saveNote({ content_markdown: '' });
          if (!active) return;
          noteIdRef.current = created.id;
          setContent(created.content_markdown);
        }
      })
      .catch(() => {
        if (active) setSaveState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setContent(value);
    setSaveState('saving');

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const id = noteIdRef.current;
      if (id === null) {
        setSaveState('error');
        return;
      }
      try {
        const updated = await saveNote({ id, content_markdown: value });
        noteIdRef.current = updated.id;
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, DEBOUNCE_MS);
  };

  return (
    <div className="notes-editor">
      <div className="notes-save-state">
        {saveState === 'saving' && 'Saving…'}
        {saveState === 'saved' && 'Saved'}
        {saveState === 'error' && 'Save failed'}
      </div>
      <textarea
        className="notes-textarea"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Write your notes in Markdown…"
      />
    </div>
  );
}
