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


const SPRITE_SIZE: i32 = 128;       // 2× native 64px — displayed at 128px
const SPRITE_OFFSET_X: i32 = 66;    // anchored left, not centered
const SPRITE_OFFSET_Y: i32 = 68;    // anchored low, leaving ~68px above for the bubble
const MARGIN: i32 = 8;

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

    // Idempotent: if already in requested mode, just emit the event so frontend stays in sync
    if current == mode_str {
        let state = if current == "asleep" {
            let _ = app.emit("pet-state-changed", serde_json::json!({ "state": "asleep" }));
            PetState::Asleep
        } else {
            let _ = app.emit("pet-state-changed", serde_json::json!({ "state": "awake" }));
            PetState::Awake
        };
        return Ok(state);
    }

    write_pet_mode(app, mode_str);

    match mode {
        PetMode::Asleep => {
            // Instantly snap pet window to work-area corner
            if let Some(window) = app.get_webview_window("pet") {
                let (cx, cy) = compute_corner_target(app);
                println!("[window] set_pet_mode(asleep): snapping to ({}, {})", cx, cy);
                let _ = window.set_position(tauri::PhysicalPosition::new(cx, cy));
            } else {
                println!("[window] set_pet_mode(asleep): no pet window found");
            }

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

pub(crate) fn compute_corner_target(app: &AppHandle) -> (i32, i32) {
    // Window is 260x210 with a 128x128 sprite anchored at (66, 68).
    // We want the sprite's bottom-right to be at work_area corner - MARGIN.
    // Window TL must be offset left and up by the sprite's position within it.
    // All offsets are logical — multiply by scale_factor for physical coords.
    let pet_win = app.get_webview_window("pet");
    let sf = pet_win
        .as_ref()
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
    let monitor = pet_win
        .and_then(|w| w.current_monitor().ok())
        .flatten();

    let offset_x = ((SPRITE_OFFSET_X + SPRITE_SIZE + MARGIN) as f64 * sf) as i32;
    let offset_y = ((SPRITE_OFFSET_Y + SPRITE_SIZE + MARGIN) as f64 * sf) as i32;

    if let Some(m) = monitor {
        let wa = m.work_area();
        let cx = wa.position.x + wa.size.width as i32 - offset_x;
        let cy = wa.position.y + wa.size.height as i32 - offset_y;
        (cx, cy)
    } else {
        let primary = app
            .primary_monitor()
            .ok()
            .flatten();
        if let Some(m) = primary {
            let wa = m.work_area();
            let cx = wa.position.x + wa.size.width as i32 - offset_x;
            let cy = wa.position.y + wa.size.height as i32 - offset_y;
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

/// Register or remove the OS login item, then persist the choice.
/// (Before this, the toggle only wrote to SQLite and never reached Windows.)
pub(crate) fn apply_auto_start(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    if enabled { launcher.enable() } else { launcher.disable() }.map_err(|e| e.to_string())?;

    let conn = db::get_connection(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('auto_start_enabled', ?1)",
        rusqlite::params![enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply_auto_start(&app, enabled)
}

/// Global hotkey handler: bring the pet back and wake it where it is.
pub(crate) fn wake_from_hotkey(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("pet") {
        let _ = win.show();
    }
    let _ = do_set_pet_mode(app, PetMode::Awake);
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
