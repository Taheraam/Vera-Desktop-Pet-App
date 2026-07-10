import React, { useEffect, useRef } from 'react';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';

const SPRITES_BASE = '/src/assets/sprites/';

interface DragState {
  startX: number;
  startY: number;
  winX: number;
  winY: number;
  dragging: boolean;
}

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const dragRef = useRef<DragState>({ startX: 0, startY: 0, winX: 0, winY: 0, dragging: false });

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
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        winX: pos.x,
        winY: pos.y,
        dragging: true,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Window not ready yet
    }
  };

  const onPointerMove = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    try {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      await getCurrentWindow().setPosition(new LogicalPosition(d.winX + dx, d.winY + dy));
    } catch {
      // ignore
    }
  };

  const onPointerUp = () => {
    dragRef.current.dragging = false;
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
