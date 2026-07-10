export interface Task {
  id: number;
  title: string;
  notes: string | null;
  dueAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface Note {
  id: number;
  contentMarkdown: string;
  updatedAt: number;
}

export interface Alarm {
  id: number;
  taskId: number | null;
  fireAt: number;
  firedAt: number | null;
  missed: boolean;
}

export type PetState = 'hidden' | 'idle' | 'interactive';

export interface Monitor {
  name: string;
  size: [number, number];
  position: [number, number];
  scaleFactor: number;
}

export interface Settings {
  renderEngine: 'canvas' | 'webgl';
  hotkey: string;
  autoStartEnabled: boolean;
  contextEngineEnabled: boolean;
}

export type ProviderName = 'openai' | 'anthropic' | 'gemini';

export interface ProviderStatus {
  provider: ProviderName;
  isActive: boolean;
  lastVerifiedAt: number | null;
}

export interface McpServer {
  name: string;
  connectedAt: number;
}

export type AgentActionStatus =
  | 'pending_consent'
  | 'approved'
  | 'executed'
  | 'denied'
  | 'failed'
  | 'expired';

export interface AgentAction {
  id: number;
  delegationId: string;
  taskId: number | null;
  provider: string;
  mcpServer: string;
  actionType: string;
  targetSummary: string;
  status: AgentActionStatus;
  createdAt: number;
  resolvedAt: number | null;
}

export type ContextState = 'coding' | 'browsing' | 'idle' | 'unknown';

// Animation states (shared between pet-window renderer and event bridge)
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

// ── Event payloads (backend → both windows) ─────────────────────────────────

export interface TaskCreatedPayload { task: Task; }
export interface TaskUpdatedPayload { task: Task; }
export interface TaskCompletedPayload { task: Task; }
export interface TaskDeletedPayload { id: number; }
export interface NoteUpdatedPayload { note: Note; }
export interface NoteDeletedPayload { id: number; }
export interface AlarmCreatedPayload { alarm: Alarm; }
export interface AlarmFiredPayload { alarm: Alarm; task: Task | null; }
export interface MissedAlarmsReadyPayload { alarms: Alarm[]; }
export interface PetStateChangedPayload { state: PetState; }
export interface AgentConsentRequestedPayload {
  delegationId: string;
  agentActionId: number;
  actionType: string;
  targetSummary: string;
  mcpServer: string;
}
export interface AgentActionResolvedPayload {
  delegationId: string;
  agentActionId: number;
  status: string;
  detail?: string;
}
export interface DelegationCompletedPayload {
  delegationId: string;
  finalMessage: string;
}
export interface ContextChangedPayload { context: ContextState; }

// ── Tauri plugin & utility types ─────────────────────────────────────────────

export interface CreateTaskParams extends Record<string, unknown> {
  title: string;
  notes?: string;
  dueAt?: number;
}
export interface UpdateTaskParams extends Record<string, unknown> {
  id: number;
  title?: string;
  notes?: string;
  dueAt?: number;
}
export interface AddProviderKeyParams extends Record<string, unknown> {
  provider: ProviderName;
  apiKey: string;
}
export interface DelegateTaskToAgentParams extends Record<string, unknown> {
  taskId: number;
  instruction: string;
}
export interface RespondToConsentRequestParams extends Record<string, unknown> {
  agentActionId: number;
  approved: boolean;
}
export interface IngestDroppedContentParams extends Record<string, unknown> {
  kind: 'file' | 'text' | 'image';
  payload: string;
}
