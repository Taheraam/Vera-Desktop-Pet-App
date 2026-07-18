import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { ingestDroppedContent, setPetMode, onEvent, acknowledgeAlarm, getSettings } from '../shared/ipc-client';
import type { AlarmFiredPayload } from '../shared/types';
import { GreetBubble } from './GreetBubble';

const SPRITES_BASE = '/src/assets/sprites/';
const CARD_AUTO_DISMISS_MS = 30_000;
const GREETING_DURATION_MS = 4000;
const BLINK_FRAME_INDEX = 1;

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [petMode, setPetModeState] = useState<'awake' | 'asleep'>('awake');
  const [alarmCard, setAlarmCard] = useState<AlarmFiredPayload | null>(null);
  const alarmCardRef = useRef<AlarmFiredPayload | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [greetingMessage, setGreetingMessage] = useState("Hi! I'm here to help you stay on track.");
  const [showGreeting, setShowGreeting] = useState(false);
  const prevPetModeRef = useRef<'awake' | 'asleep' | null>(null);
  const launchGreetingShownRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new PetRenderer(canvas);
    rendererRef.current = renderer;

    let bridge: AnimationStateBridge | null = null;

    (async () => {
      try {
        await renderer.loadSprites(SPRITES_BASE);
        renderer.startLoop();

        bridge = new AnimationStateBridge(renderer);
        bridgeRef.current = bridge;
        await bridge.start();

        // Show launch greeting once everything is ready
        if (!launchGreetingShownRef.current) {
          launchGreetingShownRef.current = true;
          await triggerGreeting();
        }
      } catch (err) {
        console.error('Pet renderer failed to start:', err);
      }
    })();

    return () => {
      renderer.stopLoop();
      bridge?.stop();
    };
  }, []);

  // Keep canvas sized to the window
  useEffect(() => {
    const win = getCurrentWindow();
    const updateSize = async () => {
      try {
        const size = await win.innerSize();
        const scale = await win.scaleFactor();
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = size.width * scale;
          canvas.height = size.height * scale;
          canvas.style.width = `${size.width}px`;
          canvas.style.height = `${size.height}px`;
        }
      } catch {
        // Window not ready yet
      }
    };
    updateSize();
    const unlisten = win.onResized(updateSize);
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const triggerGreeting = useCallback(async () => {
    try {
      const settings = await getSettings();
      setGreetingMessage(settings.greetingMessage);
    } catch {
      // Use cached/default message
    }
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.holdFrame('idle', BLINK_FRAME_INDEX, GREETING_DURATION_MS);
    }
    setShowGreeting(true);
  }, []);

  const handleGreetingAutoHide = useCallback(() => {
    setShowGreeting(false);
  }, []);

  // Detect wake transition for greeting
  useEffect(() => {
    const unlisten = onEvent('pet-state-changed', ({ state }) => {
      const prevMode = prevPetModeRef.current;
      const newMode = state === 'asleep' ? 'asleep' : 'awake';
      prevPetModeRef.current = newMode;
      setPetModeState(newMode);

      // Show greeting when waking from asleep
      if (prevMode === 'asleep' && newMode === 'awake') {
        triggerGreeting();
      }
    });
    prevPetModeRef.current = 'awake';
    return () => { unlisten.then((fn) => fn()); };
  }, [triggerGreeting]);

  // Listen for pet-relocate → animate window position (bounded tween)
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = onEvent('pet-relocate', async ({ targetX, targetY, durationMs }) => {
      const startPos = await win.outerPosition();
      const startX = startPos.x;
      const startY = startPos.y;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const x = Math.round(startX + (targetX - startX) * eased);
        const y = Math.round(startY + (targetY - startY) * eased);
        win.setPosition(new LogicalPosition(x, y));
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
        // On arrival, animation-state.ts handles walk→sleep transition
      };
      requestAnimationFrame(animate);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for alarm-fired → show bring-me-a-note card
  useEffect(() => {
    const unlisten = onEvent('alarm-fired', (p: AlarmFiredPayload) => {
      setAlarmCard(p);
      alarmCardRef.current = p;

      // Auto-dismiss after timeout
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        handleDismissCard();
      }, CARD_AUTO_DISMISS_MS);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleDismissCard = useCallback(async () => {
    const card = alarmCardRef.current;
    if (!card) return;
    try {
      await acknowledgeAlarm(card.alarm.id);
    } catch { /* not critical */ }
    setAlarmCard(null);
    alarmCardRef.current = null;
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Listen for alarm-acknowledged → hide card
  useEffect(() => {
    const unlisten = onEvent('alarm-acknowledged', () => {
      setAlarmCard(null);
      alarmCardRef.current = null;
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for Tauri file-drop events
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onDragDropEvent(async (event) => {
      if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
        for (const path of event.payload.paths) {
          try {
            await ingestDroppedContent({ kind: 'file', payload: path });
          } catch (err) {
            console.error('Failed to ingest dropped file:', err);
          }
        }
      }
      setDragOver(event.payload.type === 'over' || event.payload.type === 'drop');
    });
    return () => { unlistenPromise.then((fn) => fn()); };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Handle text drops from other apps
    const text = e.dataTransfer.getData('text');
    if (text) {
      try {
        await ingestDroppedContent({ kind: 'text', payload: text });
      } catch (err) {
        console.error('Failed to ingest dropped text:', err);
      }
    }
  };

  const handleDoubleClick = async () => {
    try {
      if (petMode === 'asleep') {
        // Wake only — does not open utility window on this same click
        await setPetMode('awake');
      } else if (petMode === 'awake') {
        // Open utility window adjacent to pet's current position
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const { Window } = await import('@tauri-apps/api/window');
        const utilityWin = await Window.getByLabel('utility');
        if (utilityWin) {
          await utilityWin.setPosition(new LogicalPosition(pos.x + 70, pos.y));
          await utilityWin.show();
          await utilityWin.setFocus();
        }
      }
    } catch (err) {
      console.error('Double-click handler failed:', err);
    }
  };

  return (
    <div
      data-tauri-drag-region
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        cursor: dragOver ? 'copy' : 'grab',
        outline: dragOver ? '2px dashed #e8765a' : 'none',
        outlineOffset: '-2px',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      <GreetBubble
        message={greetingMessage}
        visible={showGreeting}
        onAutoHide={handleGreetingAutoHide}
        durationMs={GREETING_DURATION_MS}
      />

      {alarmCard && (
        <BringMeANoteCard
          title={alarmCard.task?.title ?? 'Alarm'}
          onDismiss={handleDismissCard}
        />
      )}
    </div>
  );
}

function BringMeANoteCard({ title, onDismiss }: { title: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 200,
        background: '#faf7f2',
        border: '2px solid #e8765a',
        borderRadius: 12,
        padding: '12px 16px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: '#2a2a2a',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        textAlign: 'center',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Alarm from VeraPet</div>
      <button
        onClick={onDismiss}
        style={{
          background: '#e8765a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '6px 16px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
