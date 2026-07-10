import { useEffect, useRef, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Alarm } from '../shared/types';
import { AlarmModal } from './AlarmModal';
import { listAlarms, deleteAlarm, onEvent } from '../shared/ipc-client';

type ClockTab = 'reminder' | 'timer' | 'stopwatch';

export function ClockPanel() {
  const [tab, setTab] = useState<ClockTab>('reminder');
  const [showModal, setShowModal] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [missed, setMissed] = useState<Alarm[]>([]);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const [ringing, setRinging] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    let active = true;
    listAlarms(true)
      .then((data) => { if (active) setAlarms(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];
    unlisteners.push(
      onEvent('missed-alarms-ready', (p) => setMissed(p.alarms)),
    );
    unlisteners.push(
      onEvent('alarm-created', (p) => setAlarms((prev) => [...prev, p.alarm])),
    );
    unlisteners.push(
      onEvent('alarm-fired', (p) => {
        setRinging({
          id: p.alarm.id,
          label: new Date(p.alarm.fireAt * 1000).toLocaleString(),
        });
      }),
    );
    return () => {
      Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  const handleDeleteAlarm = async (id: number) => {
    try {
      await deleteAlarm(id);
      setAlarms((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAlarmError('Failed to delete alarm');
    }
  };

  const dismissMissed = () => setMissed([]);

  const refreshAlarms = () => {
    listAlarms(true).then(setAlarms).catch(() => setAlarmError('Failed to load alarms'));
  };

  return (
    <div className="clock-panel">
      {ringing !== null && (
        <div className="alarm-ringing">
          <span>⏰ Reminder — {ringing.label}</span>
          <button onClick={() => setRinging(null)}>Dismiss</button>
        </div>
      )}

      <div className="clock-subtabs">
        <button className={tab === 'reminder' ? 'active' : ''} onClick={() => setTab('reminder')}>Reminder</button>
        <button className={tab === 'timer' ? 'active' : ''} onClick={() => setTab('timer')}>Timer</button>
        <button className={tab === 'stopwatch' ? 'active' : ''} onClick={() => setTab('stopwatch')}>Stopwatch</button>
      </div>

      {/* Reminder section — always mounted, hidden via CSS to preserve state */}
      <div className={`clock-section${tab === 'reminder' ? ' active' : ''}`}>
        <div className="clock-content">
          {missed.length > 0 && (
            <div className="missed-summary">
              <strong>While you were away</strong>
              <p>{missed.length} reminder{missed.length !== 1 ? 's' : ''} missed.</p>
              <ul>
                {missed.map((a) => (
                  <li key={a.id}>
                    Reminder at {new Date(a.fireAt * 1000).toLocaleString()}
                    {a.taskId !== null && ` (linked to task #${a.taskId})`}
                  </li>
                ))}
              </ul>
              <button onClick={dismissMissed}>Dismiss</button>
            </div>
          )}
          <div className="alarms-header">
            <h3>Reminders</h3>
            <button onClick={() => setShowModal(true)}>+ New Reminder</button>
          </div>
          {alarmError && <div className="uw-error">{alarmError}</div>}
          {alarms.length === 0 && !alarmError && (
            <div className="uw-empty">No reminders.</div>
          )}
          <ul className="alarms-list">
            {alarms.map((a) => (
              <li key={a.id} className="alarms-item">
                <span>
                  {new Date(a.fireAt * 1000).toLocaleString()}
                  {a.taskId !== null && ` (task #${a.taskId})`}
                  {a.missed ? ' [missed]' : ''}
                  {a.firedAt !== null ? ' [fired]' : ''}
                </span>
                <button className="alarms-delete" onClick={() => handleDeleteAlarm(a.id)} title="Delete reminder">×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Timer section — always mounted */}
      <div className={`clock-section${tab === 'timer' ? ' active' : ''}`}>
        <TimerSection />
      </div>

      {/* Stopwatch section — always mounted */}
      <div className={`clock-section${tab === 'stopwatch' ? ' active' : ''}`}>
        <StopwatchSection />
      </div>

      {showModal && (
        <AlarmModal
          onClose={() => {
            setShowModal(false);
            refreshAlarms();
          }}
        />
      )}
    </div>
  );
}

function TimerSection() {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const startTsRef = useRef(0);
  const totalMsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const recalcTotal = (h: number, m: number, s: number) =>
    (h * 3600 + m * 60 + s) * 1000;

  const start = () => {
    const t = recalcTotal(hours, minutes, seconds);
    if (t <= 0) return;
    totalMsRef.current = t;
    setRemaining(t);
    doneRef.current = false;
    setRunning(true);
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    startTsRef.current = performance.now();
    intervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTsRef.current;
      const left = Math.max(0, totalMsRef.current - elapsed);
      setRemaining(left);
      if (left <= 0) {
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setRunning(false);
        doneRef.current = true;
        setRemaining(0);
      }
    }, 50);
  };

  const pause = () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  const reset = () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setRemaining(0);
    totalMsRef.current = 0;
    doneRef.current = false;
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="clock-content">
      <div className="timer-display">{formatMs(remaining)}</div>
      {doneRef.current && <div className="timer-done">Time's up!</div>}
      <div className="timer-input-row">
        <label>H <input type="number" min="0" value={hours} onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))} disabled={running} /></label>
        <label>M <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))} disabled={running} /></label>
        <label>S <input type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(Math.max(0, parseInt(e.target.value) || 0))} disabled={running} /></label>
      </div>
      <div className="timer-buttons">
        {!running ? (
          <button onClick={start} disabled={recalcTotal(hours, minutes, seconds) <= 0}>Start</button>
        ) : (
          <button onClick={pause}>Pause</button>
        )}
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
}

function StopwatchSection() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTsRef = useRef(0);
  const baseMsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const start = () => {
    if (running) return;
    startTsRef.current = performance.now();
    setRunning(true);
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      const total = baseMsRef.current + (performance.now() - startTsRef.current);
      setElapsedMs(total);
    }, 10);
  };

  const pause = () => {
    if (!running) return;
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    baseMsRef.current = elapsedMs;
    setRunning(false);
  };

  const reset = () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setElapsedMs(0);
    baseMsRef.current = 0;
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  };

  return (
    <div className="clock-content">
      <div className="timer-display">{formatMs(elapsedMs)}</div>
      <div className="timer-buttons">
        {!running ? (
          <button onClick={start}>Start</button>
        ) : (
          <button onClick={pause}>Pause</button>
        )}
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
