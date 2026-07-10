use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub content_markdown: String,
    pub updated_at: i64,
}

#[tauri::command]
pub fn save_note(
    app: AppHandle,
    id: Option<i64>,
    content_markdown: String,
) -> Result<Note, String> {
    let conn = db::get_connection(&app)?;

    match id {
        Some(note_id) => {
            // Update existing note
            conn.execute(
                "UPDATE notes SET content_markdown = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![content_markdown, db::now(), note_id],
            )
            .map_err(|e| e.to_string())?;
            let note = get_note_by_id(&conn, note_id)?;
            app.emit("note-updated", serde_json::json!({ "note": &note }))
                .map_err(|e| e.to_string())?;
            Ok(note)
        }
        None => {
            // Create new note
            conn.execute(
                "INSERT INTO notes (content_markdown) VALUES (?1)",
                rusqlite::params![content_markdown],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            let note = get_note_by_id(&conn, id)?;
            app.emit("note-updated", serde_json::json!({ "note": &note }))
                .map_err(|e| e.to_string())?;
            Ok(note)
        }
    }
}

#[tauri::command]
pub fn delete_note(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    app.emit("note-deleted", serde_json::json!({ "id": id }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let conn = db::get_connection(&app)?;

    let mut stmt = conn
        .prepare("SELECT id, content_markdown, updated_at FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                content_markdown: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

fn get_note_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Note, String> {
    conn.query_row(
        "SELECT id, content_markdown, updated_at FROM notes WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                content_markdown: row.get(1)?,
                updated_at: row.get(2)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
