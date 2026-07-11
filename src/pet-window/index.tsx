import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PetRenderer } from './canvas-renderer';
import { AnimationStateBridge } from './animation-state';
import { ingestDroppedContent } from '../shared/ipc-client';

const SPRITES_BASE = '/src/assets/sprites/';

export function PetWindow(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);
  const bridgeRef = useRef<AnimationStateBridge | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  return (
    <div
      data-tauri-drag-region
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
