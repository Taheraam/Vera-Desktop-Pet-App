use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub name: String,
    pub size: (u32, u32),
    pub position: (i32, i32),
    pub scale_factor: f64,
}

#[tauri::command]
pub fn set_click_through(enabled: bool) -> Result<(), String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn get_pet_state() -> Result<String, String> {
    Ok("idle".into())
}

#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn get_monitor_layout() -> Result<Vec<MonitorInfo>, String> {
    Err("Not yet implemented".into())
}
