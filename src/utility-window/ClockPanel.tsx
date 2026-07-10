import { useEffect, useRef, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Alarm } from '../shared/types';
import { AlarmModal } from './AlarmModal';
import { listAlarms, deleteAlarm, onEvent } from '../shared/ipc-client';

type ClockTab = 'alarm' | 'timer' | 'stopwatch';

export function ClockPanel() {
  const [tab, setTab] = useState<ClockTab>('alarm');
  const [showModal, setShowModal] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [missed, setMissed] = useState<Alarm[]>([]);
  const [alarmError, setAlarmError] = useState<string | null>(null);

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
      <div className="clock-subtabs">
        <button className={tab === 'alarm' ? 'active' : ''} onClick={() => setTab('alarm')}>Alarm</button>
        <button className={tab === 'timer' ? 'active' : ''} onClick={() => setTab('timer')}>Timer</button>
        <button className={tab === 'stopwatch' ? 'active' : ''} onClick={() => setTab('stopwatch')}>Stopwatch</button>
      </div>

      {tab === 'alarm' && (
        <div className="clock-content">
          {missed.length > 0 && (
            <div className="missed-summary">
              <strong>While you were away</strong>
              <p>{missed.length} alarm{missed.length !== 1 ? 's' : ''} missed.</p>
              <ul>
                {missed.map((a) => (
                  <li key={a.id}>
                    Alarm at {new Date(a.fireAt * 1000).toLocaleString()}
                    {a.taskId !== null && ` (linked to task #${a.taskId})`}
                  </li>
                ))}
              </ul>
              <button onClick={dismissMissed}>Dismiss</button>
            </div>
          )}
          <div className="alarms-header">
            <h3>Alarms</h3>
            <button onClick={() => setShowModal(true)}>+ New Alarm</button>
          </div>
          {alarmError && <div className="uw-error">{alarmError}</div>}
          {alarms.length === 0 && !alarmError && (
            <div className="uw-empty">No alarms.</div>
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
                <button className="alarms-delete" onClick={() => handleDeleteAlarm(a.id)} title="Delete alarm">×</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'timer' && <TimerSection />}
      {tab === 'stopwatch' && <StopwatchSection />}

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
  const [totalSec, setTotalSec] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return clearTimer;
  }, []);

  const start = () => {
    if (remaining <= 0) return;
    doneRef.current = false;
    setRunning(true);
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          setRunning(false);
          doneRef.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pause = () => {
    clearTimer();
    setRunning(false);
  };

  const reset = () => {
    clearTimer();
    setRunning(false);
    setRemaining(totalSec);
    doneRef.current = false;
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, parseInt(e.target.value) || 0);
    setTotalSec(val);
    if (!running) setRemaining(val);
  };

  return (
    <div className="clock-content">
      <div className="timer-display">{formatTime(remaining)}</div>
      {doneRef.current && <div className="timer-done">Time's up!</div>}
      <div className="timer-input-row">
        <label>
          Seconds
          <input type="number" min="0" value={totalSec} onChange={handleInput} disabled={running} />
        </label>
      </div>
      <div className="timer-buttons">
        {!running ? (
          <button onClick={start} disabled={remaining <= 0}>Start</button>
        ) : (
          <button onClick={pause}>Pause</button>
        )}
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
}

function StopwatchSection() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return clearTimer;
  }, []);

  const start = () => {
    setRunning(true);
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  };

  const pause = () => {
    clearTimer();
    setRunning(false);
  };

  const reset = () => {
    clearTimer();
    setRunning(false);
    setElapsed(0);
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="clock-content">
      <div className="timer-display">{formatTime(elapsed)}</div>
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
