import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  AnimationState, ContextState,
  AgentConsentRequestedPayload, AgentActionResolvedPayload,
  AlarmFiredPayload, TaskCompletedPayload,
} from '../shared/types';
import { onEvent } from '../shared/ipc-client';
import { PetRenderer } from './canvas-renderer';

// Priority tiers (lower number = higher priority)
const PRIORITY: Record<AnimationState, number> = {
  waking_up: 0,
  consent_ask: 1,
  bring_me_a_note: 2,
  celebrate: 3,
  happy: 4,
  eating: 5,
  sleep: 6,
  walk: 7,
  worried: 8,
  typing_focused: 9,
  idle: 10,
};

export class AnimationStateBridge {
  private renderer: PetRenderer;
  private pendingState: AnimationState | null = null;
  private unlisteners: UnlistenFn[] = [];
  private busy = false;

  constructor(renderer: PetRenderer) {
    this.renderer = renderer;
    this.renderer.fsm.onAnimationComplete(() => this.onAnimationComplete());
  }

  async start(): Promise<void> {
    const tasks: Promise<UnlistenFn>[] = [
      onEvent('task-completed', (p: TaskCompletedPayload) => {
        this.requestState('happy');
        // Revert to idle once the task list has no overdue items
        // (check via pets worst case fallback — timeout return)
      }),

      onEvent('alarm-fired', (_p: AlarmFiredPayload) => {
        this.requestState('bring_me_a_note');
      }),

      onEvent('fullscreen-cleared', () => {
        this.requestState('waking_up');
      }),

      onEvent('context-changed', (p: { context: ContextState }) => {
        if (p.context === 'idle' || p.context === 'unknown') {
          this.requestState('idle');
        }
      }),

      onEvent('agent-consent-requested', (_p: AgentConsentRequestedPayload) => {
        this.requestState('consent_ask');
      }),

      onEvent('agent-action-resolved', (_p: AgentActionResolvedPayload) => {
        this.requestState('idle');
      }),
    ];

    this.unlisteners = await Promise.all(tasks);
  }

  stop(): void {
    for (const fn of this.unlisteners) {
      fn();
    }
    this.unlisteners = [];
  }

  requestState(state: AnimationState): void {
    // waking_up always preempts (highest priority)
    if (state === 'waking_up') {
      this.pendingState = null;
      this.renderer.fsm.transition('waking_up');
      this.busy = true;
      return;
    }

    // If currently busy with a non-looping animation, queue the request
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

  // Called when a non-looping animation reaches its final frame
  private onAnimationComplete(): void {
    this.busy = false;

    if (this.pendingState !== null) {
      const next = this.pendingState;
      this.pendingState = null;
      this.applyState(next);
    }
  }

  private applyState(state: AnimationState): void {
    const nonLooping: AnimationState[] = [
      'waking_up', 'happy', 'celebrate', 'eating', 'bring_me_a_note',
    ];
    this.renderer.fsm.transition(state);
    if (nonLooping.includes(state)) {
      this.busy = true;
    }
  }
}
