import React, { useEffect, useRef } from 'react';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';

const SPRITES_BASE = '/src/assets/sprites/';

interface DragState {
  active: boolean;
  lastScreenX: number;
  lastScreenY: number;
  winX: number;
  winY: number;
}

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const dragRef = useRef<DragState>({
    active: false,
    lastScreenX: 0, lastScreenY: 0,
    winX: 0, winY: 0,
  });

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

  const onPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const d = dragRef.current;
      d.active = true;
      d.lastScreenX = e.screenX;
      d.lastScreenY = e.screenY;
      d.winX = pos.x;
      d.winY = pos.y;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Window not ready yet
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.screenX - d.lastScreenX;
    const dy = e.screenY - d.lastScreenY;
    d.lastScreenX = e.screenX;
    d.lastScreenY = e.screenY;
    d.winX += dx;
    d.winY += dy;
    // Clamp so at least 10px of the window stays on-screen
    const clampedX = Math.max(-54, Math.min(d.winX, 3000));
    const clampedY = Math.max(-54, Math.min(d.winY, 2000));
    getCurrentWindow()
      .setPosition(new PhysicalPosition(clampedX, clampedY))
      .catch(() => {});
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        cursor: 'grab',
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
