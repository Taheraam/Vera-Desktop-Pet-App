use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub render_engine: String,
    pub hotkey: String,
    pub auto_start_enabled: bool,
    pub context_engine_enabled: bool,
    pub greeting_message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub render_engine: Option<String>,
    pub hotkey: Option<String>,
    pub auto_start_enabled: Option<bool>,
    pub context_engine_enabled: Option<bool>,
    pub greeting_message: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            render_engine: "canvas".to_string(),
            hotkey: "Alt+P".to_string(),
            auto_start_enabled: false,
            context_engine_enabled: true,
            greeting_message: "Hi! I'm here to help you stay on track.".to_string(),
        }
    }
}

fn read_setting(app: &AppHandle, key: &str, default: &str) -> String {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return default.to_string(),
    };
    conn.query_row(
        "SELECT value FROM app_state WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

fn write_setting(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let conn = db::get_connection(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let s = Settings {
        render_engine: read_setting(&app, "render_engine", "canvas"),
        hotkey: read_setting(&app, "hotkey", "Alt+P"),
        auto_start_enabled: read_setting(&app, "auto_start_enabled", "false") == "true",
        context_engine_enabled: read_setting(&app, "context_engine_enabled", "true") == "true",
        greeting_message: read_setting(
            &app,
            "greeting_message",
            "Hi! I'm here to help you stay on track.",
        ),
    };
    Ok(s)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: SettingsUpdate) -> Result<Settings, String> {
    if let Some(v) = settings.render_engine {
        write_setting(&app, "render_engine", &v)?;
    }
    if let Some(v) = settings.hotkey {
        write_setting(&app, "hotkey", &v)?;
    }
    if let Some(v) = settings.auto_start_enabled {
        write_setting(&app, "auto_start_enabled", &v.to_string())?;
    }
    if let Some(v) = settings.context_engine_enabled {
        write_setting(&app, "context_engine_enabled", &v.to_string())?;
    }
    if let Some(v) = settings.greeting_message {
        write_setting(&app, "greeting_message", &v)?;
    }
    get_settings(app)
}
