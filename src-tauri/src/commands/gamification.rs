use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

pub const XP_PER_TASK: i64 = 10;
const XP_PER_LEVEL: i64 = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XpState {
    pub xp: i64,
    pub level: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub note_id: i64,
}

/// Convert dropped content into a note. The frontend sends the file path
/// (for kind=file) or the raw text (for kind=text).
#[tauri::command]
pub fn ingest_dropped_content(
    app: AppHandle,
    kind: String,
    payload: String,
) -> Result<IngestResult, String> {
    let content = match kind.as_str() {
        "file" => {
            // Try to read the file at the given path
            match std::fs::read_to_string(&payload) {
                Ok(text) => {
                    let filename = std::path::Path::new(&payload)
                        .file_name()
                        .map(|n| n.to_string_lossy())
                        .unwrap_or(std::borrow::Cow::Borrowed("file"));
                    format!("# Dropped: {}\n\n{}", filename, text)
                }
                Err(_) => {
                    // Binary file or unreadable — store the path as a reference
                    format!("# Dropped file: {}", payload)
                }
            }
        }
        "text" => {
            format!("# Dropped text\n\n{}", payload)
        }
        _ => return Err(format!("Unknown drop kind: {}", kind)),
    };

    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT INTO notes (content_markdown, updated_at) VALUES (?1, ?2)",
        rusqlite::params![content, db::now()],
    )
    .map_err(|e| e.to_string())?;

    let note_id = conn.last_insert_rowid();
    let note = crate::commands::notes::get_note_by_id(&conn, note_id)?;

    app.emit("note-updated", serde_json::json!({ "note": &note }))
        .map_err(|e| e.to_string())?;

    app.emit("content-ingested", serde_json::json!({ "kind": kind }))
        .map_err(|e| e.to_string())?;

    Ok(IngestResult { note_id })
}

#[tauri::command]
pub fn get_xp_state(app: AppHandle) -> Result<XpState, String> {
    let conn = db::get_connection(&app)?;

    let xp: i64 = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'xp_total'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let level = xp / XP_PER_LEVEL;

    Ok(XpState { xp, level })
}

/// Award XP and emit xp-changed so the frontend can update.
pub fn award_xp(app: &AppHandle, amount: i64) {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };

    let current: i64 = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'xp_total'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let new_xp = current + amount;
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('xp_total', ?1)",
        rusqlite::params![new_xp.to_string()],
    );

    let state = XpState {
        xp: new_xp,
        level: new_xp / XP_PER_LEVEL,
    };
    let _ = app.emit("xp-changed", serde_json::json!({ "xp": state.xp, "level": state.level }));
}
