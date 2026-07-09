use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub name: String,
    pub size: (u32, u32),
    pub position: (i32, i32),
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub render_engine: String,
    pub hotkey: String,
    pub auto_start_enabled: bool,
    pub context_engine_enabled: bool,
}

/// Global pet state stored in app_state. Starts as "idle".
/// Transitions: idle ↔ interactive (click-through toggle), hidden (fullscreen).
#[tauri::command]
pub fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = if enabled { "idle" } else { "interactive" };

    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('pet_state', ?1)",
        rusqlite::params![state],
    )
    .map_err(|e| e.to_string())?;

    app.emit("pet-state-changed", serde_json::json!({ "state": state }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_pet_state(app: AppHandle) -> Result<String, String> {
    let conn = db::get_connection(&app)?;
    let state: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'pet_state'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "idle".to_string());

    Ok(state)
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('auto_start_enabled', ?1)",
        rusqlite::params![enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;

    // Actual OS-level autostart is handled by tauri-plugin-autostart in the frontend
    Ok(())
}

#[tauri::command]
pub fn get_monitor_layout(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    use tauri::Manager;

    let monitors = app
        .available_monitors()
        .map_err(|e| e.to_string())?;

    let layout = monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let pos = m.position();
            let size = m.size();
            MonitorInfo {
                name: format!("monitor_{}", i),
                size: (size.width, size.height),
                position: (pos.x, pos.y),
                scale_factor: m.scale_factor(),
            }
        })
        .collect();

    Ok(layout)
}
