// Declaring the app's commands makes Tauri generate an `allow-<command>` permission
// for each one. Commands are then denied unless a capability file grants them, so
// every window only gets the IPC surface it actually uses (see capabilities/).
const COMMANDS: &[&str] = &[
    "create_task",
    "update_task",
    "complete_task",
    "reopen_task",
    "delete_task",
    "list_tasks",
    "save_note",
    "delete_note",
    "list_notes",
    "create_alarm",
    "delete_alarm",
    "list_alarms",
    "get_missed_alarms_summary",
    "acknowledge_alarm",
    "set_pet_mode",
    "get_pet_state",
    "set_auto_start",
    "get_monitor_layout",
    "ingest_dropped_content",
    "get_xp_state",
    "add_provider_key",
    "remove_provider_key",
    "verify_provider_key",
    "list_providers",
    "set_active_provider",
    "list_mcp_servers",
    "connect_mcp_server",
    "disconnect_mcp_server",
    "delegate_task_to_agent",
    "respond_to_consent_request",
    "list_agent_actions",
    "get_current_context",
    "get_permission_status",
    "request_accessibility_permission",
    "set_context_engine",
    "get_settings",
    "update_settings",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
