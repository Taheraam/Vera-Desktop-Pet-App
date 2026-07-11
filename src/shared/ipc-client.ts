import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Task, Note, Alarm, PetState, Monitor, Settings,
  ProviderStatus, McpServer, AgentAction, ContextState,
  CreateTaskParams, UpdateTaskParams,
  IngestDroppedContentParams,
} from './types';

// ── Task Commands ────────────────────────────────────────────────────────────

export function createTask(p: CreateTaskParams): Promise<Task> {
  return invoke('create_task', p);
}
export function updateTask(p: UpdateTaskParams): Promise<Task> {
  return invoke('update_task', p);
}
export function completeTask(id: number): Promise<Task> {
  return invoke('complete_task', { id });
}
export function deleteTask(id: number): Promise<void> {
  return invoke('delete_task', { id });
}
export function listTasks(includeCompleted?: boolean): Promise<Task[]> {
  const p: Record<string, unknown> = {};
  if (includeCompleted !== undefined) p.includeCompleted = includeCompleted;
  return invoke('list_tasks', p);
}

// ── Notes Commands ───────────────────────────────────────────────────────────

export function saveNote(p: { id?: number; contentMarkdown: string }): Promise<Note> {
  return invoke('save_note', p);
}
export function deleteNote(id: number): Promise<void> {
  return invoke('delete_note', { id });
}
export function listNotes(): Promise<Note[]> {
  return invoke('list_notes');
}

// ── Alarm Commands ───────────────────────────────────────────────────────────

export function createAlarm(p: { taskId?: number; fireAt: number }): Promise<Alarm> {
  return invoke('create_alarm', p);
}
export function deleteAlarm(id: number): Promise<void> {
  return invoke('delete_alarm', { id });
}
export function listAlarms(upcomingOnly?: boolean): Promise<Alarm[]> {
  const p: Record<string, unknown> = {};
  if (upcomingOnly !== undefined) p.upcomingOnly = upcomingOnly;
  return invoke('list_alarms', p);
}
export function getMissedAlarmsSummary(): Promise<Alarm[]> {
  return invoke('get_missed_alarms_summary');
}

// ── Window & OS Behavior Commands ────────────────────────────────────────────

export function setClickThrough(enabled: boolean): Promise<void> {
  return invoke('set_click_through', { enabled });
}
export function getPetState(): Promise<PetState> {
  return invoke('get_pet_state');
}
export function setAutoStart(enabled: boolean): Promise<void> {
  return invoke('set_auto_start', { enabled });
}
export function getMonitorLayout(): Promise<Monitor[]> {
  return invoke('get_monitor_layout');
}

// ── AI Provider & MCP Agent Commands ─────────────────────────────────────────

export function addProviderKey(p: { provider: string; apiKey: string }): Promise<void> {
  return invoke('add_provider_key', p);
}
export function removeProviderKey(provider: string): Promise<void> {
  return invoke('remove_provider_key', { provider });
}
export function verifyProviderKey(provider: string): Promise<{ valid: boolean; error?: string }> {
  return invoke('verify_provider_key', { provider });
}
export function listProviders(): Promise<ProviderStatus[]> {
  return invoke('list_providers');
}
export function setActiveProvider(provider: string): Promise<void> {
  return invoke('set_active_provider', { provider });
}
export function listMcpServers(): Promise<McpServer[]> {
  return invoke('list_mcp_servers');
}
export function connectMcpServer(p: { name: string; config: object }): Promise<McpServer> {
  return invoke('connect_mcp_server', p);
}
export function disconnectMcpServer(name: string): Promise<void> {
  return invoke('disconnect_mcp_server', { name });
}
export function delegateTaskToAgent(p: { taskId: number; instruction: string }): Promise<{ delegationId: string }> {
  return invoke('delegate_task_to_agent', p);
}
export function respondToConsentRequest(p: { agentActionId: number; approved: boolean }): Promise<void> {
  return invoke('respond_to_consent_request', p);
}
export function listAgentActions(limit?: number): Promise<AgentAction[]> {
  return invoke('list_agent_actions', { limit });
}

// ── Context Engine Commands ──────────────────────────────────────────────────

export function requestAccessibilityPermission(): Promise<{ granted: boolean }> {
  return invoke('request_accessibility_permission');
}
export function getPermissionStatus(): Promise<{ accessibility: boolean; context_engine_enabled: boolean }> {
  return invoke('get_permission_status');
}
export function getCurrentContext(): Promise<ContextState> {
  return invoke('get_current_context');
}

// ── Drag-and-Drop Commands ───────────────────────────────────────────────────

export function ingestDroppedContent(p: IngestDroppedContentParams): Promise<{ noteId: number }> {
  return invoke('ingest_dropped_content', p);
}

// ── Gamification Commands ────────────────────────────────────────────────────

export function getXpState(): Promise<{ xp: number; level: number }> {
  return invoke('get_xp_state');
}

// ── Debug Commands ───────────────────────────────────────────────────────────

export function debugCheckAlarms(): Promise<number> {
  return invoke('debug_check_alarms');
}

// ── Settings Commands ────────────────────────────────────────────────────────

export function getSettings(): Promise<Settings> {
  return invoke('get_settings');
}
export function updateSettings(p: Partial<Settings>): Promise<Settings> {
  return invoke('update_settings', p);
}

// ── Event Listeners (typed wrappers around @tauri-apps/api/event) ────────────

type EventPayloadMap = {
  'task-created': { task: Task };
  'task-updated': { task: Task };
  'task-completed': { task: Task };
  'task-deleted': { id: number };
  'note-updated': { note: Note };
  'note-deleted': { id: number };
  'alarm-created': { alarm: Alarm };
  'alarm-fired': { alarm: Alarm; task: Task | null };
  'missed-alarms-ready': { alarms: Alarm[] };
  'pet-state-changed': { state: PetState };
  'fullscreen-detected': Record<string, never>;
  'fullscreen-cleared': Record<string, never>;
  'agent-consent-requested': {
    delegationId: string;
    agentActionId: number;
    actionType: string;
    targetSummary: string;
    mcpServer: string;
  };
  'agent-action-resolved': {
    delegationId: string;
    agentActionId: number;
    status: string;
    detail?: string;
  };
  'delegation-completed': { delegationId: string; finalMessage: string };
  'context-changed': { context: ContextState };
  'xp-changed': { xp: number; level: number };
  'all-tasks-completed': Record<string, never>;
};

export function onEvent<E extends keyof EventPayloadMap>(
  event: E,
  handler: (payload: EventPayloadMap[E]) => void,
): Promise<UnlistenFn> {
  return listen<EventPayloadMap[E]>(event, (e) => handler(e.payload));
}
