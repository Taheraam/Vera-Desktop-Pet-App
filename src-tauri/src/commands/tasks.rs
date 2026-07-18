use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub due_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

#[tauri::command]
pub fn create_task(
    app: AppHandle,
    title: String,
    notes: Option<String>,
    due_at: Option<i64>,
) -> Result<Task, String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT INTO tasks (title, notes, due_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![title, notes, due_at],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let task = get_task_by_id(&conn, id)?;

    app.emit("task-created", serde_json::json!({ "task": &task }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app);

    Ok(task)
}

#[tauri::command]
pub fn update_task(
    app: AppHandle,
    id: i64,
    title: Option<String>,
    notes: Option<String>,
    due_at: Option<i64>,
) -> Result<Task, String> {
    let conn = db::get_connection(&app)?;

    // Fetch current values, apply overrides
    let current = get_task_by_id(&conn, id)?;
    let new_title = title.unwrap_or(current.title);
    let new_notes = notes.or(current.notes);
    let new_due_at = due_at.or(current.due_at);

    conn.execute(
        "UPDATE tasks SET title = ?1, notes = ?2, due_at = ?3 WHERE id = ?4",
        rusqlite::params![new_title, new_notes, new_due_at, id],
    )
    .map_err(|e| e.to_string())?;

    let task = get_task_by_id(&conn, id)?;
    app.emit("task-updated", serde_json::json!({ "task": &task }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app);

    Ok(task)
}

#[tauri::command]
pub fn complete_task(app: AppHandle, id: i64) -> Result<Task, String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "UPDATE tasks SET completed_at = ?1 WHERE id = ?2",
        rusqlite::params![db::now(), id],
    )
    .map_err(|e| e.to_string())?;

    let task = get_task_by_id(&conn, id)?;
    app.emit("task-completed", serde_json::json!({ "task": &task }))
        .map_err(|e| e.to_string())?;

    // Award XP for completing a task
    crate::commands::gamification::award_xp(&app, crate::commands::gamification::XP_PER_TASK);

    // Check if all tasks are now complete — trigger celebrate
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE completed_at IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if remaining == 0 {
        let _ = app.emit("all-tasks-completed", serde_json::json!({}));
    }

    check_and_emit_overdue(&app);

    Ok(task)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    // Alarms cascade-delete via FK constraint
    conn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    app.emit("task-deleted", serde_json::json!({ "id": id }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app);

    Ok(())
}

#[tauri::command]
pub fn list_tasks(
    app: AppHandle,
    include_completed: Option<bool>,
) -> Result<Vec<Task>, String> {
    let conn = db::get_connection(&app)?;
    let show_completed = include_completed.unwrap_or(false);

    let mut stmt = if show_completed {
        conn.prepare("SELECT id, title, notes, due_at, completed_at, created_at FROM tasks ORDER BY created_at DESC")
    } else {
        conn.prepare("SELECT id, title, notes, due_at, completed_at, created_at FROM tasks WHERE completed_at IS NULL ORDER BY created_at DESC")
    }
    .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                due_at: row.get(3)?,
                completed_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app);

    Ok(tasks)
}

fn get_task_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Task, String> {
    conn.query_row(
        "SELECT id, title, notes, due_at, completed_at, created_at FROM tasks WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                due_at: row.get(3)?,
                completed_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn check_and_emit_overdue(app: &AppHandle) {
    let conn = match crate::db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return,
    };
    let now = crate::db::now();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE due_at IS NOT NULL AND due_at < ?1 AND completed_at IS NULL",
            rusqlite::params![now],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count > 0 {
        let _ = app.emit("overdue-detected", json!({ "count": count }));
    } else {
        let _ = app.emit("overdue-cleared", json!({}));
    }
}
