import { useState } from 'react';
import { TaskList } from './TaskList';
import { NotesEditor } from './NotesEditor';
import { AlarmModal } from './AlarmModal';
import './utility.css';

type Tab = 'tasks' | 'notes' | 'settings';

export function UtilityWindow() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [showAlarm, setShowAlarm] = useState(false);

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
        {tab === 'settings' && <div className="uw-stub">Settings coming soon.</div>}
      </main>

      {showAlarm && <AlarmModal onClose={() => setShowAlarm(false)} />}
    </div>
  );
}
