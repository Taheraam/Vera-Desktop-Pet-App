import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { ingestDroppedContent, setPetMode, onEvent, getSettings } from '../shared/ipc-client';
import { GreetBubble } from './GreetBubble';

const SPRITES_BASE = '/src/assets/sprites/';
const GREETING_DURATION_MS = 4000;
const BLINK_FRAME_INDEX = 1;
const IDLE_PARK_TIMEOUT_MS = 10_000;

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [petMode, setPetModeState] = useState<'awake' | 'asleep'>('awake');
  const [greetingMessage, setGreetingMessage] = useState("Hi! I'm here to help you stay on track.");
  const [showGreeting, setShowGreeting] = useState(false);
  const launchGreetingShownRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        // Wire the onWake callback — triggers greeting on double-click wake
        bridge.onWake(async () => {
          await triggerGreeting();
        });

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

  // Pet-window-local idle detection: 10s of no mouse activity → auto-park
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (petMode === 'awake') {
      idleTimerRef.current = setTimeout(() => {
        console.log('[pet] idle timer fired, calling setPetMode(asleep)');
        setPetMode('asleep').then(() => {
          console.log('[pet] setPetMode(asleep) resolved successfully');
        }).catch((err) => {
          console.error('[pet] setPetMode(asleep) failed:', err);
        });
      }, IDLE_PARK_TIMEOUT_MS);
    }
  }, [petMode]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Track pet mode state via event
  useEffect(() => {
    const unlisten = onEvent('pet-state-changed', ({ state }) => {
      setPetModeState(state === 'asleep' ? 'asleep' : 'awake');
      resetIdleTimer();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [resetIdleTimer]);

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
      resetIdleTimer();
    });
    return () => { unlistenPromise.then((fn) => fn()); };
  }, [resetIdleTimer]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
    resetIdleTimer();
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const text = e.dataTransfer.getData('text');
    if (text) {
      try {
        await ingestDroppedContent({ kind: 'text', payload: text });
      } catch (err) {
        console.error('Failed to ingest dropped text:', err);
      }
    }
    resetIdleTimer();
  };

  const handleDoubleClick = async () => {
    try {
      if (petMode === 'asleep') {
        // Interrupt parked cycle, wake the pet
        bridgeRef.current?.interruptParkedCycle();
        await setPetMode('awake');
        // onWake callback in bridge already triggers greet bubble
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
    resetIdleTimer();
  };

  const handleMouseMove = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  return (
    <div
      data-tauri-drag-region
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={resetIdleTimer}
      onKeyDown={resetIdleTimer}
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
      tabIndex={0}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          imageRendering: 'pixelated',
        }}
      />

      <GreetBubble
        message={greetingMessage}
        visible={showGreeting}
        onAutoHide={handleGreetingAutoHide}
        durationMs={GREETING_DURATION_MS}
      />
    </div>
  );
}
