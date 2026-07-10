import { useEffect, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Task } from '../shared/types';
import { listTasks, createTask, completeTask, updateTask, deleteTask, onEvent } from '../shared/ipc-client';

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    let active = true;
    listTasks()
      .then((data) => {
        if (active) setTasks(data);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(
      onEvent('task-created', (p) => {
        setTasks((prev) => [...prev, p.task]);
      }),
    );
    unlisteners.push(
      onEvent('task-completed', (p) => {
        setTasks((prev) => prev.filter((t) => t.id !== p.task.id));
      }),
    );
    unlisteners.push(
      onEvent('task-updated', (p) => {
        setTasks((prev) => prev.map((t) => (t.id === p.task.id ? p.task : t)));
      }),
    );
    unlisteners.push(
      onEvent('task-deleted', (p) => {
        setTasks((prev) => prev.filter((t) => t.id !== p.id));
      }),
    );

    return () => {
      Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const task = await createTask({ title });
      setTasks((prev) => [...prev, task]);
      setNewTitle('');
    } catch (err) {
      setError(String(err));
    }
  };

  const handleToggle = async (task: Task) => {
    try {
      await completeTask(task.id);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTask(id);
    } catch (err) {
      setError(String(err));
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = async (id: number) => {
    const title = editTitle.trim();
    if (!title || editingId === null) {
      setEditingId(null);
      return;
    }
    try {
      await updateTask({ id, title });
      setEditingId(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  if (loading) return <div className="uw-loading">Loading tasks…</div>;

  return (
    <div className="tasklist">
      <form onSubmit={handleAdd} className="tasklist-add">
        <input
          type="text"
          value={newTitle}
          placeholder="Add a task…"
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      {error && <div className="uw-error">{error}</div>}

      <ul className="tasklist-items">
        {tasks.length === 0 && <li className="uw-empty">No tasks yet.</li>}
        {tasks.map((task) => (
          <li key={task.id} className="tasklist-item">
            <label>
              <input
                type="checkbox"
                checked={task.completed_at !== null}
                onChange={() => handleToggle(task)}
              />
              {editingId === task.id ? (
                <input
                  type="text"
                  className="tasklist-edit-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => saveEdit(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(task.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                />
              ) : (
                <span onDoubleClick={() => startEdit(task)}>{task.title}</span>
              )}
            </label>
            <button
              className="tasklist-delete"
              onClick={() => handleDelete(task.id)}
              title="Delete task"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
