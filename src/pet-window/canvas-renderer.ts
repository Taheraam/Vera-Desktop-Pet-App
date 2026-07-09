// Canvas 2D sprite renderer — sprite sheet loader, animation FSM, frame-throttled render loop

export interface SpriteSheetMeta {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'sleep'
  | 'waking_up'
  | 'happy'
  | 'worried'
  | 'celebrate'
  | 'typing_focused'
  | 'eating'
  | 'consent_ask'
  | 'bring_me_a_note';

export const ALL_STATES: AnimationState[] = [
  'idle', 'walk', 'sleep', 'waking_up', 'happy', 'worried',
  'celebrate', 'typing_focused', 'eating', 'consent_ask', 'bring_me_a_note',
];

// Render throttle target per state (frames per second).
// Looping ambient states use ~8fps; one-off emotional states use ~10fps.
const THROTTLE_FPS: Record<string, number> = {
  idle: 8,
  sleep: 8,
  worried: 8,
  typing_focused: 8,
  consent_ask: 8,
  walk: 10,
  happy: 10,
  celebrate: 10,
  eating: 10,
  waking_up: 7,
  bring_me_a_note: 7,
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.fsm = new AnimationFSM();
  }

  get isReady(): boolean {
    return this.spritesReady;
  }

  async loadSprites(basePath: string): Promise<void> {
    const promises = ALL_STATES.map(async (state) => {
      const [meta, image] = await Promise.all([
        this.fetchJSON<SpriteSheetMeta>(`${basePath}${state}.json`),
        this.loadImage(`${basePath}${state}.png`),
      ]);
      this.sprites.set(state, { image, meta });
    });

    await Promise.all(promises);
    this.spritesReady = true;
  }

  render(): void {
    const sprite = this.sprites.get(this.fsm.currentState);
    if (!sprite) return;

    const { image, meta } = sprite;
    const frameX = this.fsm.currentFrameIndex * meta.frameWidth;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply horizontal mirror when facing left (sprites are generated right-facing only)
    if (this.fsm.facingLeft) {
      this.ctx.save();
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.scale(-1, 1);
      this.ctx.translate(-this.canvas.width, 0);

      this.ctx.drawImage(
        image,
        frameX, 0,
        meta.frameWidth, meta.frameHeight,
        0, 0,
        this.canvas.width, this.canvas.height,
      );

      this.ctx.restore();
    } else {
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(
        image,
        frameX, 0,
        meta.frameWidth, meta.frameHeight,
        0, 0,
        this.canvas.width, this.canvas.height,
      );
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
