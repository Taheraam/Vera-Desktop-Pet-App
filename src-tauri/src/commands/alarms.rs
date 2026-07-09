use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alarm {
    pub id: i64,
    pub task_id: Option<i64>,
    pub fire_at: i64,
    pub fired_at: Option<i64>,
    pub missed: bool,
}

#[tauri::command]
pub fn create_alarm(
    app: AppHandle,
    task_id: Option<i64>,
    fire_at: i64,
) -> Result<Alarm, String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT INTO alarms (task_id, fire_at) VALUES (?1, ?2)",
        rusqlite::params![task_id, fire_at],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let alarm = get_alarm_by_id(&conn, id)?;

    app.emit("alarm-created", serde_json::json!({ "alarm": &alarm }))
        .map_err(|e| e.to_string())?;
    Ok(alarm)
}

#[tauri::command]
pub fn delete_alarm(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    conn.execute("DELETE FROM alarms WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_alarms(
    app: AppHandle,
    upcoming_only: Option<bool>,
) -> Result<Vec<Alarm>, String> {
    let conn = db::get_connection(&app)?;
    let now = db::now();

    let mut stmt = if upcoming_only.unwrap_or(false) {
        conn.prepare(
            "SELECT id, task_id, fire_at, fired_at, missed FROM alarms
             WHERE fire_at > ?1 AND fired_at IS NULL
             ORDER BY fire_at ASC",
        )
    } else {
        conn.prepare(
            "SELECT id, task_id, fire_at, fired_at, missed FROM alarms
             ORDER BY fire_at ASC",
        )
    }
    .map_err(|e| e.to_string())?;

    let alarms = stmt
        .query_map(rusqlite::params![now], |row| {
            Ok(Alarm {
                id: row.get(0)?,
                task_id: row.get(1)?,
                fire_at: row.get(2)?,
                fired_at: row.get(3)?,
                missed: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(alarms)
}

#[tauri::command]
pub fn get_missed_alarms_summary(app: AppHandle) -> Result<Vec<Alarm>, String> {
    let conn = db::get_connection(&app)?;

    // Get last_alive_timestamp from app_state
    let last_alive: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'last_alive_timestamp'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| db::now().to_string());

    let last_alive_ts: i64 = last_alive.parse().unwrap_or(0);
    let now = db::now();

    // Find alarms that fired while the app was closed
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, fire_at, fired_at, missed FROM alarms
             WHERE fire_at >= ?1 AND fire_at < ?2 AND fired_at IS NULL
             ORDER BY fire_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let alarms = stmt
        .query_map(rusqlite::params![last_alive_ts, now], |row| {
            Ok(Alarm {
                id: row.get(0)?,
                task_id: row.get(1)?,
                fire_at: row.get(2)?,
                fired_at: row.get(3)?,
                missed: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Mark them as missed
    for alarm in &alarms {
        conn.execute(
            "UPDATE alarms SET missed = 1 WHERE id = ?1",
            rusqlite::params![alarm.id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update last_alive_timestamp to now
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('last_alive_timestamp', ?1)",
        rusqlite::params![now.to_string()],
    )
    .map_err(|e| e.to_string())?;

    // Emit if there are missed alarms
    if !alarms.is_empty() {
        app.emit("missed-alarms-ready", serde_json::json!({ "alarms": &alarms }))
            .map_err(|e| e.to_string())?;
    }

    Ok(alarms)
}

fn get_alarm_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Alarm, String> {
    conn.query_row(
        "SELECT id, task_id, fire_at, fired_at, missed FROM alarms WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Alarm {
                id: row.get(0)?,
                task_id: row.get(1)?,
                fire_at: row.get(2)?,
                fired_at: row.get(3)?,
                missed: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
