use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub content_markdown: String,
    pub updated_at: i64,
}

#[tauri::command]
pub fn save_note(id: Option<i64>, content_markdown: String) -> Result<Note, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn delete_note(id: i64) -> Result<(), String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn list_notes() -> Result<Vec<Note>, String> {
    Err("Not yet implemented".into())
}
