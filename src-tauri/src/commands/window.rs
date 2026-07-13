use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetMode {
    Awake,
    Asleep,
}

impl PetMode {
    fn as_str(&self) -> &'static str {
        match self {
            PetMode::Awake => "awake",
            PetMode::Asleep => "asleep",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetState {
    Hidden,
    Awake,
    Asleep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub size: (u32, u32),
    pub position: (i32, i32),
    pub scale_factor: f64,
    pub work_area: WorkArea,
}

const PET_WIDTH: i32 = 64;
const PET_HEIGHT: i32 = 64;
const MARGIN: i32 = 8;
const RELOCATE_DURATION_MS: u64 = 1000;

pub(crate) fn read_pet_mode(app: &AppHandle) -> String {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return "awake".to_string(),
    };
    conn.query_row(
        "SELECT value FROM app_state WHERE key = 'pet_mode'",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "awake".to_string())
}

pub(crate) fn write_pet_mode(app: &AppHandle, mode: &str) {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('pet_mode', ?1)",
        rusqlite::params![mode],
    );
}

pub(crate) fn do_set_pet_mode(app: &AppHandle, mode: PetMode) -> Result<PetState, String> {
    let current = read_pet_mode(app);
    let mode_str = mode.as_str();

    // Idempotent: if already in requested mode, return current state
    if current == mode_str {
        let state = if current == "asleep" {
            PetState::Asleep
        } else {
            PetState::Awake
        };
        return Ok(state);
    }

    write_pet_mode(app, mode_str);

    match mode {
        PetMode::Asleep => {
            // Compute corner target from the pet window's current monitor
            let (target_x, target_y) = compute_corner_target(app);

            let _ = app.emit(
                "pet-relocate",
                serde_json::json!({
                    "targetX": target_x,
                    "targetY": target_y,
                    "durationMs": RELOCATE_DURATION_MS,
                }),
            );

            let _ = app.emit(
                "pet-state-changed",
                serde_json::json!({ "state": "asleep" }),
            );

            Ok(PetState::Asleep)
        }
        PetMode::Awake => {
            let _ = app.emit(
                "pet-state-changed",
                serde_json::json!({ "state": "awake" }),
            );

            Ok(PetState::Awake)
        }
    }
}

fn compute_corner_target(app: &AppHandle) -> (i32, i32) {
    // Find the monitor the pet window is currently on
    let monitor = app
        .get_webview_window("pet")
        .and_then(|w| w.current_monitor().ok())
        .flatten();

    if let Some(m) = monitor {
        let wa = m.work_area();
        let cx = wa.position.x + wa.size.width as i32 - PET_WIDTH - MARGIN;
        let cy = wa.position.y + wa.size.height as i32 - PET_HEIGHT - MARGIN;
        (cx, cy)
    } else {
        // Fallback: primary monitor
        let primary = app
            .primary_monitor()
            .ok()
            .flatten();
        if let Some(m) = primary {
            let wa = m.work_area();
            let cx = wa.position.x + wa.size.width as i32 - PET_WIDTH - MARGIN;
            let cy = wa.position.y + wa.size.height as i32 - PET_HEIGHT - MARGIN;
            (cx, cy)
        } else {
            (0, 0)
        }
    }
}

#[tauri::command]
pub fn set_pet_mode(app: AppHandle, mode: PetMode) -> Result<PetState, String> {
    do_set_pet_mode(&app, mode)
}

#[tauri::command]
pub fn get_pet_state(app: AppHandle) -> Result<PetState, String> {
    // hidden is computed from window visibility, never persisted
    if let Some(window) = app.get_webview_window("pet") {
        if !window.is_visible().map_err(|e| e.to_string())? {
            return Ok(PetState::Hidden);
        }
    }

    let mode = read_pet_mode(&app);
    match mode.as_str() {
        "asleep" => Ok(PetState::Asleep),
        _ => Ok(PetState::Awake),
    }
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('auto_start_enabled', ?1)",
        rusqlite::params![enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_monitor_layout(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|e| e.to_string())?;

    let layout = monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let pos = m.position();
            let size = m.size();
            let wa = m.work_area();
            MonitorInfo {
                name: format!("monitor_{}", i),
                size: (size.width, size.height),
                position: (pos.x, pos.y),
                scale_factor: m.scale_factor(),
                work_area: WorkArea {
                    x: wa.position.x,
                    y: wa.position.y,
                    width: wa.size.width,
                    height: wa.size.height,
                },
            }
        })
        .collect();

    Ok(layout)
}
