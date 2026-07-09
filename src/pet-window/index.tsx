import React, { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { setClickThrough } from '../shared/ipc-client';

const SPRITES_BASE = '/src/assets/sprites/';

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);

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

        // Enable click-through after a short idle period
        setTimeout(() => {
          setClickThrough(true).catch(() => { /* not critical */ });
        }, 5000);
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

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        cursor: 'default',
      }}
    />
  );
}
