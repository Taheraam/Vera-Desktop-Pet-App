use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::db;

/// Start the alarm scheduler background thread.
/// Uses a smart sleep: wakes at the next alarm's fire_at, or every 60s if idle.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let conn = match db::get_connection(&app) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[alarm_scheduler] failed to open DB: {e}");
                return;
            }
        };

        loop {
            match fire_due_alarms(&app, &conn) {
                Ok(count) => {
                    if count > 0 {
                        eprintln!("[alarm_scheduler] fired {count} alarm(s)");
                    }
                }
                Err(e) => {
                    eprintln!("[alarm_scheduler] error: {e}");
                }
            }
            let sleep_secs = next_alarm_delay(&conn);
            std::thread::sleep(Duration::from_secs(sleep_secs));
        }
    });
}

/// Compute how long to sleep until the next pending alarm (capped at 60s).
fn next_alarm_delay(conn: &rusqlite::Connection) -> u64 {
    let now = db::now();
    match conn.query_row(
        "SELECT MIN(fire_at) FROM alarms WHERE fired_at IS NULL AND fire_at > ?1",
        rusqlite::params![now],
        |row| row.get::<_, Option<i64>>(0),
    ) {
        Ok(Some(next)) => ((next - now) as u64).clamp(1, 60),
        _ => 60,
    }
}

/// Returns the number of alarms fired.
fn fire_due_alarms(app: &AppHandle, conn: &rusqlite::Connection) -> Result<usize, String> {
    let now = db::now();

    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, fire_at, fired_at, missed, acknowledged_at FROM alarms
             WHERE fire_at <= ?1 AND fired_at IS NULL
             ORDER BY fire_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let alarms: Vec<crate::commands::alarms::Alarm> = stmt
        .query_map(rusqlite::params![now], |row| {
            Ok(crate::commands::alarms::Alarm {
                id: row.get(0)?,
                task_id: row.get(1)?,
                fire_at: row.get(2)?,
                fired_at: row.get(3)?,
                missed: row.get(4)?,
                acknowledged_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let count = alarms.len();
    if count == 0 {
        return Ok(0);
    }

    for alarm in &alarms {
        // Look up linked task first
        let task = match alarm.task_id {
            Some(tid) => conn
                .query_row(
                    "SELECT id, title, notes, due_at, completed_at, created_at
                     FROM tasks WHERE id = ?1",
                    rusqlite::params![tid],
                    |row| {
                        Ok(crate::commands::tasks::Task {
                            id: row.get(0)?,
                            title: row.get(1)?,
                            notes: row.get(2)?,
                            due_at: row.get(3)?,
                            completed_at: row.get(4)?,
                            created_at: row.get(5)?,
                        })
                    },
                )
                .ok(),
            None => None,
        };

        // Emit event FIRST so frontend never misses a notification.
        // If emit fails, we return early WITHOUT marking the alarm as fired,
        // so it will be retried on the next poll cycle.
        app.emit(
            "alarm-fired",
            serde_json::json!({
                "alarm": alarm,
                "task": task,
            }),
        )
        .map_err(|e| e.to_string())?;

        // Only mark fired AFTER successful emit
        conn.execute(
            "UPDATE alarms SET fired_at = ?1 WHERE id = ?2",
            rusqlite::params![now, alarm.id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(count)
}
