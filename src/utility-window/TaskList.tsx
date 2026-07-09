import { useEffect, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Task } from '../shared/types';
import { listTasks, createTask, completeTask, onEvent } from '../shared/ipc-client';

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Update the list immediately from backend events (no refetch)
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(
      onEvent('task-created', (p) => {
        setTasks((prev) => [...prev, p.task]);
      }),
    );
    unlisteners.push(
      onEvent('task-completed', (p) => {
        // Default list excludes completed tasks, so drop it from view
        setTasks((prev) => prev.filter((t) => t.id !== p.task.id));
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
      // task-completed event removes it from the view
    } catch (err) {
      setError(String(err));
    }
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
              <span>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
