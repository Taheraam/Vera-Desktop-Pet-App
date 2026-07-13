import { useState, useEffect, useCallback } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  Task, Note, Alarm, PetState, Settings, ProviderStatus,
  ContextState, AnimationState,
} from './types';
import {
  listTasks, completeTask, deleteTask, createTask,
  listNotes, saveNote, deleteNote,
  listAlarms, createAlarm, deleteAlarm, getMissedAlarmsSummary,
  listProviders,
  getSettings, updateSettings,
  getCurrentContext,
  onEvent,
} from './ipc-client';

// ── Task Hooks ───────────────────────────────────────────────────────────────

export function useTasks(include_completed = false): {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  handleComplete: (id: number) => Promise<void>;
  handleDelete: (id: number) => Promise<void>;
  handleCreate: (p: { title: string; notes?: string; due_at?: number }) => Promise<Task>;
} {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listTasks(include_completed);
      setTasks(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [include_completed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    const events = ['task-created', 'task-updated', 'task-completed', 'task-deleted'] as const;
    for (const ev of events) {
      unlisteners.push(onEvent(ev, refresh));
    }
    return () => { Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn())); };
  }, [refresh]);

  const handleComplete = useCallback(async (id: number) => {
    await completeTask(id);
    await refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteTask(id);
    await refresh();
  }, [refresh]);

  const handleCreate = useCallback(async (p: { title: string; notes?: string; due_at?: number }) => {
    const task = await createTask(p);
    await refresh();
    return task;
  }, [refresh]);

  return { tasks, loading, error, refresh, handleComplete, handleDelete, handleCreate };
}

// ── Note Hooks ───────────────────────────────────────────────────────────────

export function useNotes(): {
  notes: Note[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  handleSave: (p: { id?: number; contentMarkdown: string }) => Promise<Note>;
  handleDelete: (id: number) => Promise<void>;
} {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listNotes();
      setNotes(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    const events = ['note-updated', 'note-deleted'] as const;
    for (const ev of events) {
      unlisteners.push(onEvent(ev, refresh));
    }
    return () => { Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn())); };
  }, [refresh]);

  const handleSave = useCallback(async (p: { id?: number; contentMarkdown: string }) => {
    const note = await saveNote(p);
    await refresh();
    return note;
  }, [refresh]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteNote(id);
    await refresh();
  }, [refresh]);

  return { notes, loading, error, refresh, handleSave, handleDelete };
}

// ── Alarm Hooks ──────────────────────────────────────────────────────────────

export function useAlarms(upcomingOnly = true): {
  alarms: Alarm[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  handleCreate: (p: { taskId?: number; fireAt: number }) => Promise<Alarm>;
  handleDelete: (id: number) => Promise<void>;
} {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listAlarms(upcomingOnly);
      setAlarms(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [upcomingOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    const events = ['alarm-created', 'missed-alarms-ready'] as const;
    for (const ev of events) {
      unlisteners.push(onEvent(ev, refresh));
    }
    return () => { Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn())); };
  }, [refresh]);

  const handleCreate = useCallback(async (p: { taskId?: number; fireAt: number }) => {
    const alarm = await createAlarm(p);
    await refresh();
    return alarm;
  }, [refresh]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteAlarm(id);
    await refresh();
  }, [refresh]);

  return { alarms, loading, error, refresh, handleCreate, handleDelete };
}

// ── Pet State Hook ───────────────────────────────────────────────────────────

export function usePetState(): {
  state: PetState;
  playbackState: AnimationState;
} {
  const [state, setState] = useState<PetState>('awake');
  const [playbackState, setPlaybackState] = useState<AnimationState>('idle');

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    unlisteners.push(
      onEvent('pet-state-changed', (p) => setState(p.state)),
    );
    return () => { Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn())); };
  }, []);

  return { state, playbackState };
}

// ── Settings Hook ────────────────────────────────────────────────────────────

export function useSettings(): {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  handleUpdate: (p: Partial<Settings>) => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSettings();
      setSettings(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpdate = useCallback(async (p: Partial<Settings>) => {
    const updated = await updateSettings(p);
    setSettings(updated);
  }, []);

  return { settings, loading, error, refresh, handleUpdate };
}

// ── AI Provider Hooks ────────────────────────────────────────────────────────

export function useProviders(): {
  providers: ProviderStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listProviders();
      setProviders(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { providers, loading, error, refresh };
}

// ── Context Hook ─────────────────────────────────────────────────────────────

export function useContextState(): {
  context: ContextState | null;
  loading: boolean;
  error: string | null;
} {
  const [context, setContext] = useState<ContextState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentContext()
      .then(setContext)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    const unlisten = onEvent('context-changed', (p) => setContext(p.context));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return { context, loading, error };
}

// ── Missed Alarms Hook ───────────────────────────────────────────────────────

export function useMissedAlarms(): {
  missed: Alarm[];
  loading: boolean;
  error: string | null;
} {
  const [missed, setMissed] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMissedAlarmsSummary()
      .then(setMissed)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    const unlisten = onEvent('missed-alarms-ready', (p) => setMissed(p.alarms));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return { missed, loading, error };
}
