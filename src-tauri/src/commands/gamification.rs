use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;

pub const XP_PER_TASK: i64 = 10;
const XP_PER_LEVEL: i64 = 100;

/// Files larger than this are stored as a reference, not inlined into a note.
pub const MAX_INLINE_BYTES: u64 = 1_000_000;
/// Dropped text larger than this is rejected.
const MAX_TEXT_CHARS: usize = 200_000;

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

/// Turn a dropped file into note markdown. Only called from Rust with paths that
/// came from the OS drag-drop event (see main.rs), never with a path from JavaScript.
pub fn render_dropped_file(path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());

    if meta.len() > MAX_INLINE_BYTES {
        return Ok(format!(
            "# Dropped file: {name}\n\n{} ({} bytes, too large to inline)",
            path.display(),
            meta.len()
        ));
    }
    Ok(match std::fs::read_to_string(path) {
        Ok(text) => format!("# Dropped: {name}\n\n{text}"),
        Err(_) => format!("# Dropped file: {name}\n\n{} (binary)", path.display()),
    })
}

fn insert_note_and_emit(app: &AppHandle, content: &str, kind: &str) -> Result<i64, String> {
    let conn = db::get_connection(app)?;
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
    Ok(note_id)
}

/// Rust-side handler for files dropped on the pet window.
pub fn ingest_file(app: &AppHandle, path: &Path) -> Result<i64, String> {
    let content = render_dropped_file(path)?;
    insert_note_and_emit(app, &content, "file")
}

/// IPC entry point for dropped TEXT only. File drops are handled in Rust from the
/// OS event, so a script in the webview can't make the backend read an arbitrary path.
#[tauri::command(async)]
pub fn ingest_dropped_content(
    app: AppHandle,
    kind: String,
    payload: String,
) -> Result<IngestResult, String> {
    if kind != "text" {
        return Err(format!("Unsupported drop kind over IPC: {kind}"));
    }
    if payload.chars().count() > MAX_TEXT_CHARS {
        return Err("Dropped text is too large".into());
    }
    let note_id = insert_note_and_emit(&app, &format!("# Dropped text\n\n{payload}"), "text")?;
    Ok(IngestResult { note_id })
}

fn read_xp(conn: &rusqlite::Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM app_state WHERE key = 'xp_total'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(0)
}

#[tauri::command]
pub fn get_xp_state(app: AppHandle) -> Result<XpState, String> {
    let conn = db::get_connection(&app)?;
    let xp = read_xp(&conn);
    Ok(XpState { xp, level: xp / XP_PER_LEVEL })
}

/// Add XP in one statement, so two threads can't lose an update.
pub fn add_xp(conn: &rusqlite::Connection, amount: i64) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES ('xp_total', ?1)
         ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + ?1 AS TEXT)",
        rusqlite::params![amount.to_string()],
    )?;
    Ok(read_xp(conn))
}

/// Award XP and emit xp-changed so the frontend can update.
pub fn award_xp(app: &AppHandle, amount: i64) {
    let Ok(conn) = db::get_connection(app) else { return };
    let Ok(xp) = add_xp(&conn, amount) else { return };
    let _ = app.emit("xp-changed", serde_json::json!({ "xp": xp, "level": xp / XP_PER_LEVEL }));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("verapet-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn text_files_are_inlined() {
        let p = tmp("hello.txt");
        std::fs::write(&p, "hi there").unwrap();
        assert_eq!(render_dropped_file(&p).unwrap(), "# Dropped: hello.txt\n\nhi there");
    }

    #[test]
    fn large_files_are_referenced_not_read() {
        let p = tmp("big.log");
        std::fs::write(&p, vec![b'a'; (MAX_INLINE_BYTES + 1) as usize]).unwrap();
        let note = render_dropped_file(&p).unwrap();
        assert!(note.contains("too large to inline"));
        assert!(note.len() < 1_000);
    }

    #[test]
    fn binary_files_are_referenced() {
        let p = tmp("img.bin");
        std::fs::write(&p, [0xff, 0xfe, 0x00, 0x80]).unwrap();
        assert!(render_dropped_file(&p).unwrap().contains("(binary)"));
    }

    #[test]
    fn directories_are_rejected() {
        assert!(render_dropped_file(&std::env::temp_dir()).is_err());
    }

    #[test]
    fn xp_accumulates() {
        let conn = db::test_conn();
        assert_eq!(add_xp(&conn, 10).unwrap(), 10);
        assert_eq!(add_xp(&conn, 10).unwrap(), 20);
    }
}
