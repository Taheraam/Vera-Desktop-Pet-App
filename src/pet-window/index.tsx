import React, { useEffect, useRef } from 'react';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';

const SPRITES_BASE = '/src/assets/sprites/';

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  winX: number;
  winY: number;
  pendingX: number;
  pendingY: number;
  rafId: number | null;
}

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const dragRef = useRef<DragState>({
    active: false,
    startX: 0, startY: 0,
    winX: 0, winY: 0,
    pendingX: 0, pendingY: 0,
    rafId: null,
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

  const applyPosition = () => {
    const d = dragRef.current;
    d.rafId = null;
    if (!d.active) return;
    getCurrentWindow()
      .setPosition(new LogicalPosition(d.pendingX, d.pendingY))
      .catch(() => {});
  };

  const onPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const d = dragRef.current;
      d.active = true;
      d.startX = e.clientX;
      d.startY = e.clientY;
      d.winX = pos.x;
      d.winY = pos.y;
      d.pendingX = pos.x;
      d.pendingY = pos.y;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Window not ready yet
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.pendingX = d.winX + (e.clientX - d.startX);
    d.pendingY = d.winY + (e.clientY - d.startY);
    if (d.rafId === null) {
      d.rafId = requestAnimationFrame(applyPosition);
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    d.active = false;
    if (d.rafId !== null) {
      cancelAnimationFrame(d.rafId);
      d.rafId = null;
    }
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
