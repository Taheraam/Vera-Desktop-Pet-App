import { useEffect, useState } from 'react';
import type { Task } from '../shared/types';
import { createAlarm, listTasks } from '../shared/ipc-client';

interface AlarmModalProps {
  onClose: () => void;
}

export function AlarmModal({ onClose }: AlarmModalProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fireAtLocal, setFireAtLocal] = useState('');
  const [taskId, setTaskId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTasks()
      .then(setTasks)
      .catch(() => setError('Failed to load tasks'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fireAtLocal) {
      setError('Please pick a date and time.');
      return;
    }
    const fireAt = Math.floor(new Date(fireAtLocal).getTime() / 1000);
    if (Number.isNaN(fireAt)) {
      setError('Invalid date.');
      return;
    }
    try {
      await createAlarm(
        taskId === ''
          ? { fireAt }
          : { fireAt, taskId: Number(taskId) },
      );
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Alarm</h3>
        {error && <div className="uw-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            When
            <input
              type="datetime-local"
              value={fireAtLocal}
              onChange={(e) => setFireAtLocal(e.target.value)}
              required
            />
          </label>
          <label>
            Link task (optional)
            <select
              value={taskId}
              onChange={(e) =>
                setTaskId(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">— No task —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
