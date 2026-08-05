// Canvas 2D sprite renderer — sprite sheet loader, animation FSM, frame-throttled render loop

export interface SpriteSheetMeta {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

import type { AnimationState } from '../shared/types';

export const ALL_STATES: AnimationState[] = [
  'idle', 'sleep', 'waking_up', 'eating',
];

// Render throttle target per state (frames per second).
const THROTTLE_FPS: Record<string, number> = {
  idle: 8,
  sleep: 8,
  waking_up: 7,
  eating: 10,
};

interface SpriteSheetData {
  image: HTMLImageElement;
  meta: SpriteSheetMeta;
}

// ─── AnimationFSM ────────────────────────────────────────────────────────────

export class AnimationFSM {
  currentState: AnimationState = 'idle';
  currentFrameIndex = 0;
  frameTimer = 0;
  facingLeft = false;

  private animationCompleteCallback: (() => void) | null = null;

  onAnimationComplete(cb: () => void): void {
    this.animationCompleteCallback = cb;
  }

  transition(newState: AnimationState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.currentFrameIndex = 0;
    this.frameTimer = 0;
  }

  advance(deltaMs: number, sprites: Map<string, SpriteSheetData>): void {
    const sprite = sprites.get(this.currentState);
    if (!sprite) return;

    this.frameTimer += deltaMs;
    const frameInterval = 1000 / sprite.meta.fps;
    let advanced = false;

    while (this.frameTimer >= frameInterval) {
      this.frameTimer -= frameInterval;
      advanced = true;

      if (sprite.meta.loop) {
        this.currentFrameIndex = (this.currentFrameIndex + 1) % sprite.meta.frameCount;
      } else if (this.currentFrameIndex < sprite.meta.frameCount - 1) {
        this.currentFrameIndex++;
        // If we just landed on the last frame, fire the completion callback
        if (this.currentFrameIndex === sprite.meta.frameCount - 1) {
          this.animationCompleteCallback?.();
        }
      }
    }

    // Reset timer drift on long gaps (e.g., tab was hidden)
    if (deltaMs > 1000 && !advanced) {
      this.frameTimer = 0;
    }
  }
}

// ─── PetRenderer ─────────────────────────────────────────────────────────────

export class PetRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  fsm: AnimationFSM;
  private sprites: Map<string, SpriteSheetData> = new Map();
  private lastRenderTime = 0;
  private rafId = 0;
  private running = false;
  private spritesReady = false;
  private holdUntil: number | null = null;
  private holdState: AnimationState = 'idle';
  private holdFrameIndex = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.fsm = new AnimationFSM();
  }

  get isReady(): boolean {
    return this.spritesReady;
  }

  /** Pause normal animation and hold a specific frame for durationMs. */
  holdFrame(state: AnimationState, frameIndex: number, durationMs: number): void {
    this.holdUntil = performance.now() + durationMs;
    this.holdState = state;
    this.holdFrameIndex = frameIndex;
    this.fsm.currentState = state;
    this.fsm.currentFrameIndex = frameIndex;
    this.render();
  }

  async loadSprites(basePath: string): Promise<void> {
    const results = await Promise.allSettled(
      ALL_STATES.map(async (state) => {
        const [meta, image] = await Promise.all([
          this.fetchJSON<SpriteSheetMeta>(`${basePath}${state}.json`),
          this.loadImage(`${basePath}${state}.png`),
        ]);
        this.sprites.set(state, { image, meta });
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[pet-renderer] ${failed}/${ALL_STATES.length} sprites failed to load, using placeholders for missing states`);
    }
    this.spritesReady = true;
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // The window is 260×210 logical. Compute scale for DPI independence.
    const scale = cw / 260;

    const sprite = this.sprites.get(this.fsm.currentState);
    if (sprite) {
      const { image, meta } = sprite;
      const frameX = this.fsm.currentFrameIndex * meta.frameWidth;

      // Fixed anchor: sprite top-left at (66, 68) in logical space
      // Display at 128×128 logical (2× native 64×64)
      const sx = 66 * scale;
      const sy = 68 * scale;
      const dw = 128 * scale;
      const dh = 128 * scale;

      this.ctx.imageSmoothingEnabled = false;

      if (this.fsm.facingLeft) {
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(
          image,
          frameX, 0, meta.frameWidth, meta.frameHeight,
          -(sx + dw), sy, dw, dh,
        );
        this.ctx.restore();
      } else {
        this.ctx.drawImage(
          image,
          frameX, 0, meta.frameWidth, meta.frameHeight,
          sx, sy, dw, dh,
        );
      }
    } else {
      // Placeholder: orange circle for states without a loaded sprite
      const cx = cw / 2;
      const cy = ch / 2;
      const r = 64 * scale;
      this.ctx.fillStyle = '#e8765a';
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  startLoop(): void {
    if (this.running) return;
    this.running = true;

    const now = performance.now();
    this.lastRenderTime = now;
    this.fsm.frameTimer = 0;

    const loop = (timestamp: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);

      const deltaMs = timestamp - this.lastRenderTime;

      // If holding a specific frame (e.g. blink during greeting bubble)
      if (this.holdUntil !== null) {
        if (timestamp < this.holdUntil) {
          this.fsm.currentState = this.holdState;
          this.fsm.currentFrameIndex = this.holdFrameIndex;
          const minInterval = 1000 / 8;
          if (deltaMs >= minInterval) {
            this.render();
            this.lastRenderTime = timestamp;
          }
          return;
        }
        this.holdUntil = null;
        this.fsm.frameTimer = 0;
      }

      // Advance animation logic every frame
      this.fsm.advance(deltaMs, this.sprites);

      // Throttle rendering based on current state
      const targetFps = THROTTLE_FPS[this.fsm.currentState] ?? 10;
      const minInterval = 1000 / targetFps;

      if (deltaMs >= minInterval) {
        this.render();
        this.lastRenderTime = timestamp;
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stopLoop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  // ── private helpers ──

  private async fetchJSON<T>(url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
    return resp.json() as Promise<T>;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
}
