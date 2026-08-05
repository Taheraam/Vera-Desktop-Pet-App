import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AnimationState } from '../shared/types';
import { onEvent } from '../shared/ipc-client';
import { PetRenderer } from './canvas-renderer';

const PARKED_SLEEP_MS = 15_000;
const PARKED_EATING_MS = 15_000;

const PRIORITY: Record<AnimationState, number> = {
  waking_up: 0,
  eating: 1,
  sleep: 2,
  idle: 3,
};

export class AnimationStateBridge {
  private renderer: PetRenderer;
  private pendingState: AnimationState | null = null;
  private unlisteners: UnlistenFn[] = [];
  private busy = false;
  private petMode: 'awake' | 'asleep' = 'awake';
  private isParked = false;
  private parkedCycleTimer: ReturnType<typeof setTimeout> | null = null;
  private parkedPhase: 'sleep' | 'waking_up' | 'eating' = 'sleep';

  private onWakeCallback: (() => void) | null = null;

  constructor(renderer: PetRenderer) {
    this.renderer = renderer;
    this.renderer.fsm.onAnimationComplete(() => this.onAnimationComplete());
  }

  onWake(cb: () => void): void {
    this.onWakeCallback = cb;
  }

  async start(): Promise<void> {
    const tasks: Promise<UnlistenFn>[] = [
      onEvent('pet-state-changed', (p: { state: string }) => {
        const prevMode = this.petMode;
        this.petMode = p.state === 'asleep' ? 'asleep' : 'awake';
        console.log('[bridge] pet-state-changed:', p.state, 'prevMode:', prevMode);

        if (p.state === 'asleep' && prevMode === 'awake') {
          console.log('[bridge] starting parked cycle');
          this.startParkedCycle();
        } else if (p.state === 'awake' && prevMode === 'asleep') {
          this.stopParkedCycle();
          // On wake: waking_up plays once, then idle (via onAnimationComplete)
          this.applyState('waking_up');
          this.onWakeCallback?.();
        }
      }),

      onEvent('fullscreen-cleared', () => {
        this.applyState('waking_up');
      }),

      onEvent('content-ingested', () => {
        // Play eating animation once (non-looping), then return to idle via FSM
        this.requestState('eating');
      }),
    ];

    this.unlisteners = await Promise.all(tasks);
  }

  stop(): void {
    this.stopParkedCycle();
    for (const fn of this.unlisteners) {
      fn();
    }
    this.unlisteners = [];
  }

  /** Interrupt the parked cycle at any point — called on double-click wake. */
  interruptParkedCycle(): void {
    if (!this.isParked) return;
    this.stopParkedCycle();
    // waking_up always preempts (highest priority)
    this.pendingState = null;
    this.renderer.fsm.transition('waking_up');
    this.busy = true;
    // No optimistic write to petMode or onWakeCallback here —
    // the pet-state-changed event listener is the single canonical path.
  }

  requestState(state: AnimationState): void {
    // waking_up always preempts (highest priority)
    if (state === 'waking_up') {
      this.pendingState = null;
      this.renderer.fsm.transition('waking_up');
      this.busy = true;
      return;
    }

    if (this.busy) {
      if (
        this.pendingState === null ||
        (PRIORITY[state] ?? 10) < (PRIORITY[this.pendingState] ?? 10)
      ) {
        this.pendingState = state;
      }
      return;
    }

    this.applyState(state);
  }

  // ── Parked Cycle ────────────────────────────────────────────────────────────

  private startParkedCycle(): void {
    this.isParked = true;
    this.parkedPhase = 'sleep';
    this.applyState('sleep');
    this.scheduleNextParkedStep(PARKED_SLEEP_MS);
  }

  private stopParkedCycle(): void {
    this.isParked = false;
    if (this.parkedCycleTimer !== null) {
      clearTimeout(this.parkedCycleTimer);
      this.parkedCycleTimer = null;
    }
  }

  private scheduleNextParkedStep(ms: number): void {
    if (!this.isParked) return;
    this.parkedCycleTimer = setTimeout(() => {
      if (!this.isParked) return;
      this.advanceParkedCycle();
    }, ms);
  }

  private advanceParkedCycle(): void {
    if (!this.isParked) return;

    switch (this.parkedPhase) {
      case 'sleep':
        // sleep → waking_up (one-shot, onAnimationComplete handles next)
        this.parkedPhase = 'waking_up';
        this.applyState('waking_up');
        break;
      case 'waking_up':
        // waking_up → eating (technically this path shouldn't fire
        // because onAnimationComplete handles waking_up completion)
        this.parkedPhase = 'eating';
        this.applyState('eating');
        this.scheduleNextParkedStep(PARKED_EATING_MS);
        break;
      case 'eating':
        // eating → sleep → repeat
        this.parkedPhase = 'sleep';
        this.applyState('sleep');
        this.scheduleNextParkedStep(PARKED_SLEEP_MS);
        break;
    }
  }

  // ── FSM ─────────────────────────────────────────────────────────────────────

  private onAnimationComplete(): void {
    this.busy = false;

    // If we're in the parked cycle and waking_up just finished → go to eating
    if (this.isParked && this.parkedPhase === 'waking_up') {
      this.parkedPhase = 'eating';
      this.applyState('eating');
      this.scheduleNextParkedStep(PARKED_EATING_MS);
      return;
    }

    if (this.pendingState !== null) {
      const next = this.pendingState;
      this.pendingState = null;
      this.applyState(next);
    }
  }

  private applyState(state: AnimationState): void {
    const nonLooping: AnimationState[] = ['waking_up', 'eating'];
    this.renderer.fsm.transition(state);
    if (nonLooping.includes(state)) {
      this.busy = true;
    }
  }
}
