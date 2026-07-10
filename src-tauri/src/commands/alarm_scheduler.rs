use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::db;

/// Start the alarm scheduler background thread.
/// Polls for due alarms every 30 seconds and fires `alarm-fired` events.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(30));
            if let Err(e) = fire_due_alarms(&app) {
                eprintln!("[alarm_scheduler] error: {e}");
            }
        }
    });
}

fn fire_due_alarms(app: &AppHandle) -> Result<(), String> {
    let conn = db::get_connection(app)?;
    let now = db::now();

    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, fire_at, fired_at, missed FROM alarms
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
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for alarm in &alarms {
        // Mark as fired
        conn.execute(
            "UPDATE alarms SET fired_at = ?1 WHERE id = ?2",
            rusqlite::params![now, alarm.id],
        )
        .map_err(|e| e.to_string())?;

        // Look up linked task
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

        app.emit(
            "alarm-fired",
            serde_json::json!({
                "alarm": alarm,
                "task": task,
            }),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
