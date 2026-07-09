use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alarm {
    pub id: i64,
    pub task_id: Option<i64>,
    pub fire_at: i64,
    pub fired_at: Option<i64>,
    pub missed: bool,
}

#[tauri::command]
pub fn create_alarm(task_id: Option<i64>, fire_at: i64) -> Result<Alarm, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn delete_alarm(id: i64) -> Result<(), String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn list_alarms(upcoming_only: Option<bool>) -> Result<Vec<Alarm>, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn get_missed_alarms_summary() -> Result<Vec<Alarm>, String> {
    Err("Not yet implemented".into())
}
