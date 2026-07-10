import { useEffect, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Alarm } from '../shared/types';
import { TaskList } from './TaskList';
import { NotesEditor } from './NotesEditor';
import { AlarmModal } from './AlarmModal';
import { listAlarms, deleteAlarm, onEvent } from '../shared/ipc-client';
import './utility.css';

type Tab = 'tasks' | 'notes' | 'alarms' | 'settings';

export function UtilityWindow() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [showAlarm, setShowAlarm] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [missed, setMissed] = useState<Alarm[]>([]);
  const [alarmError, setAlarmError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAlarms(true)
      .then((data) => {
        if (active) setAlarms(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    unlisteners.push(
      onEvent('missed-alarms-ready', (p) => {
        setMissed(p.alarms);
      }),
    );
    unlisteners.push(
      onEvent('alarm-created', (p) => {
        setAlarms((prev) => [...prev, p.alarm]);
      }),
    );
    return () => {
      Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  const refreshAlarms = () => {
    listAlarms(true)
      .then(setAlarms)
      .catch(() => setAlarmError('Failed to load alarms'));
  };

  const handleDeleteAlarm = async (id: number) => {
    try {
      await deleteAlarm(id);
      setAlarms((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAlarmError('Failed to delete alarm');
    }
  };

  const dismissMissed = () => setMissed([]);

  return (
    <div className="uw-root">
      <nav className="uw-tabs">
        <button
          className={tab === 'tasks' ? 'active' : ''}
          onClick={() => setTab('tasks')}
        >
          Tasks
        </button>
        <button
          className={tab === 'notes' ? 'active' : ''}
          onClick={() => setTab('notes')}
        >
          Notes
        </button>
        <button
          className={tab === 'alarms' ? 'active' : ''}
          onClick={() => setTab('alarms')}
        >
          Alarms
        </button>
        <button
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
        {tab === 'tasks' && (
          <button className="uw-add-alarm" onClick={() => setShowAlarm(true)}>
            + Alarm
          </button>
        )}
      </nav>

      <main className="uw-content">
        {tab === 'tasks' && <TaskList />}
        {tab === 'notes' && <NotesEditor />}
        {tab === 'alarms' && (
          <div className="alarms-tab">
            {missed.length > 0 && (
              <div className="missed-summary">
                <strong>While you were away</strong>
                <p>{missed.length} alarm{missed.length !== 1 ? 's' : ''} missed.</p>
                <ul>
                  {missed.map((a) => (
                    <li key={a.id}>
                      Alarm at {new Date(a.fire_at * 1000).toLocaleString()}
                      {a.task_id !== null && ` (linked to task #${a.task_id})`}
                    </li>
                  ))}
                </ul>
                <button onClick={dismissMissed}>Dismiss</button>
              </div>
            )}
            <div className="alarms-header">
              <h3>Upcoming Alarms</h3>
              <button onClick={() => setShowAlarm(true)}>+ New Alarm</button>
            </div>
            {alarmError && <div className="uw-error">{alarmError}</div>}
            {alarms.length === 0 && !alarmError && (
              <div className="uw-empty">No upcoming alarms.</div>
            )}
            <ul className="alarms-list">
              {alarms.map((a) => (
                <li key={a.id} className="alarms-item">
                  <span>
                    {new Date(a.fire_at * 1000).toLocaleString()}
                    {a.task_id !== null && ` (task #${a.task_id})`}
                    {a.missed ? ' [missed]' : ''}
                  </span>
                  <button
                    className="alarms-delete"
                    onClick={() => handleDeleteAlarm(a.id)}
                    title="Delete alarm"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'settings' && <div className="uw-stub">Settings coming soon.</div>}
      </main>

      {showAlarm && (
        <AlarmModal
          onClose={() => {
            setShowAlarm(false);
            refreshAlarms();
          }}
        />
      )}
    </div>
  );
}
