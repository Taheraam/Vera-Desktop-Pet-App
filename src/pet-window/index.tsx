import { useEffect, useRef, useState, useCallback } from 'react';
import { getCurrentWindow, PhysicalPosition, Window } from '@tauri-apps/api/window';
import { PetRenderer, type SpriteAssets, type SpriteSheetMeta } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { ingestDroppedContent, setPetMode, onEvent, getSettings } from '../shared/ipc-client';
import { GreetBubble } from './GreetBubble';

// Bundled by Vite (hashed URLs in dist/). A plain '/src/assets/...' string only
// works on the dev server; release builds shipped without sprites.
const SPRITE_IMAGES = import.meta.glob('../assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const SPRITE_META = import.meta.glob('../assets/sprites/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, SpriteSheetMeta>;
const spriteAssets: SpriteAssets = {
  imageUrl: (state) => SPRITE_IMAGES[`../assets/sprites/${state}.png`],
  meta: (state) => SPRITE_META[`../assets/sprites/${state}.json`],
};
/** Logical px between the pet window's left edge and the utility window. */
const UTILITY_OFFSET_X = 70;
const GREETING_DURATION_MS = 5000;
const BLINK_FRAME_INDEX = 1;
const IDLE_PARK_TIMEOUT_MS = 10000;

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
        await renderer.loadSprites(spriteAssets);
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
          canvas.width = size.width;
          canvas.height = size.height;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
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

  const handleMouseDown = useCallback(async () => {
    if (petMode === 'asleep') {
      bridgeRef.current?.interruptParkedCycle();
      await setPetMode('awake');
    }
    resetIdleTimer();
  }, [petMode, resetIdleTimer]);

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

  // Drag-over outline only. Dropped FILES are read by the Rust backend straight
  // from the OS event (main.rs on_window_event), never from a path sent by JS.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onDragDropEvent((event) => {
      setDragOver(event.payload.type === 'enter' || event.payload.type === 'over');
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
        // outerPosition() is PHYSICAL pixels. Mixing it into a LogicalPosition put
        // the utility window 1.5x too far right at 150% scaling, often off-screen.
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const scale = await win.scaleFactor();
        const utilityWin = await Window.getByLabel('utility');
        if (utilityWin) {
          await utilityWin.setPosition(
            new PhysicalPosition(pos.x + Math.round(UTILITY_OFFSET_X * scale), pos.y),
          );
          await utilityWin.show();
          await utilityWin.unminimize();
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
      onMouseDown={handleMouseDown}
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
