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
      <div className="clock-subtabs">
        <button className={tab === 'alarm' ? 'active' : ''} onClick={() => setTab('alarm')}>Alarm</button>
        <button className={tab === 'timer' ? 'active' : ''} onClick={() => setTab('timer')}>Timer</button>
        <button className={tab === 'stopwatch' ? 'active' : ''} onClick={() => setTab('stopwatch')}>Stopwatch</button>
      </div>

      {tab === 'alarm' && (
        <div className="clock-content">
          {ringing !== null && (
            <div className="alarm-ringing">
              <span>⏰ Alarm — {ringing.label}</span>
              <button onClick={() => setRinging(null)}>Dismiss</button>
            </div>
          )}
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
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
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

  const recalcTotal = (h: number, m: number, s: number) => {
    return (h * 3600 + m * 60 + s) * 1000;
  };

  const start = () => {
    const t = recalcTotal(hours, minutes, seconds);
    if (t <= 0) return;
    setTotalMs(t);
    setRemaining(t);
    doneRef.current = false;
    setRunning(true);
    clearTimer();
    const startTs = performance.now();
    intervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTs;
      const left = Math.max(0, t - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearTimer();
        setRunning(false);
        doneRef.current = true;
        setRemaining(0);
      }
    }, 50);
  };

  const pause = () => {
    clearTimer();
    setRunning(false);
  };

  const reset = () => {
    clearTimer();
    setRunning(false);
    setRemaining(0);
    setTotalMs(0);
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
    if (running) return;
    startTsRef.current = performance.now();
    setRunning(true);
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      const now = performance.now();
      const total = baseMsRef.current + (now - startTsRef.current);
      setElapsedMs(total);
    }, 10);
  };

  const pause = () => {
    if (!running) return;
    clearTimer();
    baseMsRef.current = elapsedMs;
    setRunning(false);
  };

  const reset = () => {
    clearTimer();
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
