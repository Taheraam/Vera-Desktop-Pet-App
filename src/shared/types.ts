export interface Task {
  id: number;
  title: string;
  notes: string | null;
  due_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface Note {
  id: number;
  content_markdown: string;
  updated_at: number;
}

export interface Alarm {
  id: number;
  task_id: number | null;
  fire_at: number;
  fired_at: number | null;
  missed: boolean;
}

export type PetState = 'hidden' | 'idle' | 'interactive';

export interface Monitor {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface Settings {
  render_engine: 'canvas' | 'webgl';
  hotkey: string;
  auto_start_enabled: boolean;
  context_engine_enabled: boolean;
}

export type ProviderName = 'openai' | 'anthropic' | 'gemini';

export interface ProviderStatus {
  provider: ProviderName;
  is_active: boolean;
  last_verified_at: number | null;
}

export interface McpServer {
  name: string;
  connected_at: number;
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
  delegation_id: string;
  task_id: number | null;
  provider: string;
  mcp_server: string;
  action_type: string;
  target_summary: string;
  status: AgentActionStatus;
  created_at: number;
  resolved_at: number | null;
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

export interface TaskCreatedPayload {
  task: Task;
}
export interface TaskUpdatedPayload {
  task: Task;
}
export interface TaskCompletedPayload {
  task: Task;
}
export interface TaskDeletedPayload {
  id: number;
}
export interface NoteUpdatedPayload {
  note: Note;
}
export interface NoteDeletedPayload {
  id: number;
}
export interface AlarmCreatedPayload {
  alarm: Alarm;
}
export interface AlarmFiredPayload {
  alarm: Alarm;
  task: Task | null;
}
export interface MissedAlarmsReadyPayload {
  alarms: Alarm[];
}
export interface PetStateChangedPayload {
  state: PetState;
}
export interface AgentConsentRequestedPayload {
  delegation_id: string;
  agent_action_id: number;
  action_type: string;
  target_summary: string;
  mcp_server: string;
}
export interface AgentActionResolvedPayload {
  delegation_id: string;
  agent_action_id: number;
  status: string;
  detail?: string;
}
export interface DelegationCompletedPayload {
  delegation_id: string;
  final_message: string;
}
export interface ContextChangedPayload {
  context: ContextState;
}

// ── Tauri plugin & utility types ─────────────────────────────────────────────

export interface CreateTaskParams extends Record<string, unknown> {
  title: string;
  notes?: string;
  due_at?: number;
}
export interface UpdateTaskParams extends Record<string, unknown> {
  id: number;
  title?: string;
  notes?: string;
  due_at?: number;
}
export interface AddProviderKeyParams extends Record<string, unknown> {
  provider: ProviderName;
  api_key: string;
}
export interface DelegateTaskToAgentParams extends Record<string, unknown> {
  task_id: number;
  instruction: string;
}
export interface RespondToConsentRequestParams extends Record<string, unknown> {
  agent_action_id: number;
  approved: boolean;
}
export interface IngestDroppedContentParams extends Record<string, unknown> {
  kind: 'file' | 'text' | 'image';
  payload: string;
}
