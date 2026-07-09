use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub due_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

#[tauri::command]
pub fn create_task(title: String, notes: Option<String>, due_at: Option<i64>) -> Result<Task, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn update_task(id: i64, title: Option<String>, notes: Option<String>, due_at: Option<i64>) -> Result<Task, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn complete_task(id: i64) -> Result<Task, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn delete_task(id: i64) -> Result<(), String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn list_tasks(include_completed: Option<bool>) -> Result<Vec<Task>, String> {
    Err("Not yet implemented".into())
}
