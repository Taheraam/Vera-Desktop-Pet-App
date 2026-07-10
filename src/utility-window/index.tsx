import { useState } from 'react';
import { TaskList } from './TaskList';
import { NotesEditor } from './NotesEditor';
import { ClockPanel } from './ClockPanel';
import { SettingsPanel } from './SettingsPanel';
import './utility.css';

type Tab = 'tasks' | 'notes' | 'clock' | 'settings';

export function UtilityWindow() {
  const [tab, setTab] = useState<Tab>('tasks');

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
          className={tab === 'clock' ? 'active' : ''}
          onClick={() => setTab('clock')}
        >
          Clock
        </button>
        <button
          className={`uw-tab-settings${tab === 'settings' ? ' active' : ''}`}
          onClick={() => setTab('settings')}
          title="Settings"
        >
          ⚙
        </button>
      </nav>

      <main className="uw-content">
        {tab === 'tasks' && <TaskList />}
        {tab === 'notes' && <NotesEditor />}
        {tab === 'clock' && <ClockPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
