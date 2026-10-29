import { useEffect, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { TaskList } from './TaskList';
import { NotesEditor } from './NotesEditor';
import { ClockPanel } from './ClockPanel';
import { SettingsPanel } from './SettingsPanel';
import { onEvent, respondToConsentRequest, acknowledgeAlarm } from '../shared/ipc-client';
import './utility.css';

type Tab = 'tasks' | 'notes' | 'clock' | 'settings';

export function UtilityWindow() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [consent, setConsent] = useState<{
    delegationId: string;
    agentActionId: number;
    actionType: string;
    targetSummary: string;
    mcpServer: string;
  } | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [ringing, setRinging] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    let active = true;

    (async () => {
      const fns = await Promise.all([
        onEvent('agent-consent-requested', (p) => {
          if (active) setConsent(p);
        }),
        onEvent('agent-action-resolved', () => {
          if (active) setConsent(null);
        }),
        // Listened for here (always mounted), not in ClockPanel, which only exists
        // while its tab is open. The backend also brings this window to the front.
        onEvent('alarm-fired', (p) => {
          if (!active) return;
          const label = p.task?.title
            ? `${p.task.title} (${new Date(p.alarm.fireAt * 1000).toLocaleTimeString()})`
            : new Date(p.alarm.fireAt * 1000).toLocaleString();
          setRinging({ id: p.alarm.id, label });
        }),
      ]);
      if (active) unlisteners = fns;
    })();

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const handleConsent = async (approved: boolean) => {
    if (!consent || consentBusy) return;
    setConsentBusy(true);
    try {
      await respondToConsentRequest({ agentActionId: consent.agentActionId, approved });
      setConsent(null);
    } catch (err) {
      console.error('Consent response failed:', err);
    } finally {
      setConsentBusy(false);
    }
  };

  const dismissRinging = async () => {
    if (!ringing) return;
    try {
      await acknowledgeAlarm(ringing.id);
    } catch (err) {
      console.error('Acknowledge failed:', err);
    }
    setRinging(null);
  };

  return (
    <div className="uw-root">
      {ringing !== null && (
        <div className="alarm-ringing">
          <span>⏰ Reminder — {ringing.label}</span>
          <button onClick={dismissRinging}>Dismiss</button>
        </div>
      )}

      {/* Consent gate card — floats above content */}
      {consent !== null && (
        <div className="consent-overlay">
          <div className="consent-card">
            <div className="consent-header">🤖 Pet wants to act</div>
            <div className="consent-body">
              <div className="consent-action">{consent.actionType}</div>
              <div className="consent-target">{consent.targetSummary}</div>
              <div className="consent-server">via {consent.mcpServer}</div>
            </div>
            <div className="consent-actions">
              <button
                className="consent-btn consent-deny"
                onClick={() => handleConsent(false)}
                disabled={consentBusy}
              >
                Deny
              </button>
              <button
                className="consent-btn consent-approve"
                onClick={() => handleConsent(true)}
                disabled={consentBusy}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

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
        {tab === 'notes' && <NotesEditor key="notes" />}
        {tab === 'clock' && <ClockPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
