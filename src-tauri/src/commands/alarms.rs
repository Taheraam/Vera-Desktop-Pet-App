use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: i64,
    pub task_id: Option<i64>,
    pub fire_at: i64,
    pub fired_at: Option<i64>,
    pub missed: bool,
    pub acknowledged_at: Option<i64>,
}

pub const ALARM_COLUMNS: &str = "id, task_id, fire_at, fired_at, missed, acknowledged_at";

pub fn row_to_alarm(row: &rusqlite::Row) -> rusqlite::Result<Alarm> {
    Ok(Alarm {
        id: row.get(0)?,
        task_id: row.get(1)?,
        fire_at: row.get(2)?,
        fired_at: row.get(3)?,
        missed: row.get(4)?,
        acknowledged_at: row.get(5)?,
    })
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

    // Without this the scheduler could be mid-way through a 60 s sleep.
    crate::commands::alarm_scheduler::wake(&app);

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

    let alarms: rusqlite::Result<Vec<Alarm>> = if upcoming_only.unwrap_or(false) {
        conn.prepare(&format!(
            "SELECT {ALARM_COLUMNS} FROM alarms WHERE fire_at > ?1 AND fired_at IS NULL ORDER BY fire_at ASC"
        ))
        .and_then(|mut s| s.query_map(rusqlite::params![now], row_to_alarm)?.collect())
    } else {
        conn.prepare(&format!("SELECT {ALARM_COLUMNS} FROM alarms ORDER BY fire_at ASC"))
            .and_then(|mut s| s.query_map([], row_to_alarm)?.collect())
    };
    alarms.map_err(|e| e.to_string())
}

/// Alarms the scheduler marked as missed at startup that the user hasn't dismissed yet.
pub fn unacknowledged_missed(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<Alarm>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ALARM_COLUMNS} FROM alarms
         WHERE missed = 1 AND acknowledged_at IS NULL
         ORDER BY fire_at ASC"
    ))?;
    let rows = stmt.query_map([], row_to_alarm)?;
    rows.collect()
}

#[tauri::command]
pub fn get_missed_alarms_summary(app: AppHandle) -> Result<Vec<Alarm>, String> {
    let conn = db::get_connection(&app)?;
    unacknowledged_missed(&conn).map_err(|e| e.to_string())
}

fn get_alarm_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Alarm, String> {
    conn.query_row(
        &format!("SELECT {ALARM_COLUMNS} FROM alarms WHERE id = ?1"),
        rusqlite::params![id],
        row_to_alarm,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn acknowledge_alarm(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    conn.execute(
        "UPDATE alarms SET acknowledged_at = ?1 WHERE id = ?2",
        rusqlite::params![db::now(), id],
    )
    .map_err(|e| e.to_string())?;

    app.emit("alarm-acknowledged", serde_json::json!({ "id": id }))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acknowledged_missed_alarms_stop_showing() {
        let conn = db::test_conn();
        conn.execute("INSERT INTO alarms (fire_at, missed, fired_at) VALUES (10, 1, 20)", []).unwrap();
        let id = conn.last_insert_rowid();
        assert_eq!(unacknowledged_missed(&conn).unwrap().len(), 1);
        conn.execute("UPDATE alarms SET acknowledged_at = 30 WHERE id = ?1", [id]).unwrap();
        assert!(unacknowledged_missed(&conn).unwrap().is_empty());
    }
}
