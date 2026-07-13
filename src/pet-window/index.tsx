import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { ingestDroppedContent, setPetMode, onEvent } from '../shared/ipc-client';

const SPRITES_BASE = '/src/assets/sprites/';

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [petMode, setPetModeState] = useState<'awake' | 'asleep'>('awake');

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

  // Listen for pet-state-changed to track mode
  useEffect(() => {
    const unlisten = onEvent('pet-state-changed', ({ state }) => {
      setPetModeState(state === 'asleep' ? 'asleep' : 'awake');
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

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
    </div>
  );
}
