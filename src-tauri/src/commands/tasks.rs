use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

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

const TASK_COLUMNS: &str = "id, title, notes, due_at, completed_at, created_at";

pub fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        due_at: row.get(3)?,
        completed_at: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn create_task(
    app: AppHandle,
    title: String,
    notes: Option<String>,
    due_at: Option<i64>,
) -> Result<Task, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Task title can't be empty".into());
    }
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT INTO tasks (title, notes, due_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![title, notes, due_at],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let task = get_task_by_id(&conn, id)?;

    app.emit("task-created", json!({ "task": &task }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app, &conn);

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
    app.emit("task-updated", json!({ "task": &task }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app, &conn);

    Ok(task)
}

/// Set completed_at only if the task is still open. Returns true when this call
/// completed it; false when it was already done (so XP is awarded exactly once).
pub fn mark_complete(conn: &rusqlite::Connection, id: i64, now: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        "UPDATE tasks SET completed_at = ?1 WHERE id = ?2 AND completed_at IS NULL",
        rusqlite::params![now, id],
    )?;
    Ok(changed == 1)
}

#[tauri::command]
pub fn complete_task(app: AppHandle, id: i64) -> Result<Task, String> {
    let conn = db::get_connection(&app)?;
    let newly_completed = mark_complete(&conn, id, db::now()).map_err(|e| e.to_string())?;
    let task = get_task_by_id(&conn, id)?;

    if newly_completed {
        app.emit("task-completed", json!({ "task": &task }))
            .map_err(|e| e.to_string())?;

        crate::commands::gamification::award_xp(&app, crate::commands::gamification::XP_PER_TASK);

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE completed_at IS NULL", [], |row| row.get(0))
            .unwrap_or(0);
        if remaining == 0 {
            let _ = app.emit("all-tasks-completed", json!({}));
        }
        check_and_emit_overdue(&app, &conn);
    }

    Ok(task)
}

/// Undo a completion (unticking the checkbox). No XP is taken back or re-awarded.
#[tauri::command]
pub fn reopen_task(app: AppHandle, id: i64) -> Result<Task, String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "UPDATE tasks SET completed_at = NULL WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    let task = get_task_by_id(&conn, id)?;
    app.emit("task-updated", json!({ "task": &task }))
        .map_err(|e| e.to_string())?;
    check_and_emit_overdue(&app, &conn);
    Ok(task)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    // Alarms cascade-delete via FK constraint
    conn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    app.emit("task-deleted", json!({ "id": id }))
        .map_err(|e| e.to_string())?;

    check_and_emit_overdue(&app, &conn);

    Ok(())
}

#[tauri::command]
pub fn list_tasks(
    app: AppHandle,
    include_completed: Option<bool>,
) -> Result<Vec<Task>, String> {
    let conn = db::get_connection(&app)?;
    let sql = if include_completed.unwrap_or(false) {
        format!("SELECT {TASK_COLUMNS} FROM tasks ORDER BY created_at DESC")
    } else {
        format!("SELECT {TASK_COLUMNS} FROM tasks WHERE completed_at IS NULL ORDER BY created_at DESC")
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let tasks = stmt
        .query_map([], row_to_task)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(tasks)
}

fn get_task_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Task, String> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
        rusqlite::params![id],
        row_to_task,
    )
    .map_err(|e| e.to_string())
}

pub fn overdue_count(conn: &rusqlite::Connection, now: i64) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE due_at IS NOT NULL AND due_at < ?1 AND completed_at IS NULL",
        rusqlite::params![now],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

fn check_and_emit_overdue(app: &AppHandle, conn: &rusqlite::Connection) {
    let count = overdue_count(conn, db::now());
    if count > 0 {
        let _ = app.emit("overdue-detected", json!({ "count": count }));
    } else {
        let _ = app.emit("overdue-cleared", json!({}));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completing_twice_only_counts_once() {
        let conn = db::test_conn();
        conn.execute("INSERT INTO tasks (title) VALUES ('t')", []).unwrap();
        let id = conn.last_insert_rowid();
        assert!(mark_complete(&conn, id, 100).unwrap());
        assert!(!mark_complete(&conn, id, 200).unwrap(), "second completion must not award XP again");
        let done: i64 = conn
            .query_row("SELECT completed_at FROM tasks WHERE id = ?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(done, 100, "completed_at must not move forward");
    }

    #[test]
    fn completing_a_missing_task_is_a_no_op() {
        let conn = db::test_conn();
        assert!(!mark_complete(&conn, 999, 1).unwrap());
    }

    #[test]
    fn overdue_counts_only_open_tasks_past_due() {
        let conn = db::test_conn();
        conn.execute("INSERT INTO tasks (title, due_at) VALUES ('late', 10)", []).unwrap();
        conn.execute("INSERT INTO tasks (title, due_at, completed_at) VALUES ('done', 10, 5)", []).unwrap();
        conn.execute("INSERT INTO tasks (title, due_at) VALUES ('later', 1000)", []).unwrap();
        assert_eq!(overdue_count(&conn, 100), 1);
    }
}
