use tauri::{AppHandle, Emitter, Manager};

use crate::db;

/// Handle the "Call Pet" hotkey (Alt+P by default).
///
/// Three-state resolution per PRD §3.1:
/// | Current state | Action |
/// |---|---|
/// | hidden (fullscreen suppressed) | Un-hide pet window → set interactive |
/// | idle / click-through | Disable click-through → set interactive |
/// | already interactive | Open the Utility Window |
pub fn handle_call_pet(app: &AppHandle) {
    let current_state = read_pet_state(app);

    match current_state.as_str() {
        "hidden" => {
            // Un-hide the pet window and become interactive
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            write_pet_state(app, "interactive");
            let _ = app.emit(
                "pet-state-changed",
                serde_json::json!({ "state": "interactive" }),
            );
        }
        "idle" => {
            // Disable click-through — become interactive
            write_pet_state(app, "interactive");
            let _ = app.emit(
                "pet-state-changed",
                serde_json::json!({ "state": "interactive" }),
            );
        }
        "interactive" => {
            // Already interactive — reveal the utility window
            if let Some(window) = app.get_webview_window("utility") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

/// Read the current pet_state from SQLite (defaults to "idle").
fn read_pet_state(app: &AppHandle) -> String {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return "idle".to_string(),
    };
    conn.query_row(
        "SELECT value FROM app_state WHERE key = 'pet_state'",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "idle".to_string())
}

/// Persist a new pet_state to SQLite.
fn write_pet_state(app: &AppHandle, state: &str) {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('pet_state', ?1)",
        rusqlite::params![state],
    );
}
