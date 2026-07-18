use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::db;

/// Start the alarm scheduler background thread.
/// Polls for due alarms every 10 seconds (immediate first check).
pub fn start(app: AppHandle) {
    eprintln!("[alarm_scheduler] starting scheduler thread");
    std::thread::spawn(move || {
        loop {
            eprintln!("[alarm_scheduler] polling for due alarms...");
            match fire_due_alarms(&app) {
                Ok(count) => {
                    if count > 0 {
                        eprintln!("[alarm_scheduler] fired {count} alarm(s)");
                    }
                }
                Err(e) => {
                    eprintln!("[alarm_scheduler] error: {e}");
                }
            }
            std::thread::sleep(Duration::from_secs(10));
        }
    });
}

/// Debug command: manually trigger a due-alarm check from the frontend.
#[tauri::command]
pub fn debug_check_alarms(app: tauri::AppHandle) -> Result<usize, String> {
    eprintln!("[alarm_scheduler] debug_check_alarms called from frontend");
    fire_due_alarms(&app)
}

/// Returns the number of alarms fired.
fn fire_due_alarms(app: &AppHandle) -> Result<usize, String> {
    let conn = db::get_connection(app)?;
    let now = db::now();

    eprintln!("[alarm_scheduler] now={now}, checking for due alarms...");

    // First log all alarms in the DB for diagnostics
    {
        let mut count_stmt = conn
            .prepare("SELECT id, task_id, fire_at, fired_at, missed, acknowledged_at FROM alarms ORDER BY id")
            .map_err(|e| e.to_string())?;
        let all: Vec<crate::commands::alarms::Alarm> = count_stmt
            .query_map([], |row| crate::commands::alarms::row_to_alarm(row))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        if all.is_empty() {
            eprintln!("[alarm_scheduler] no alarms in DB");
        } else {
            for a in &all {
                eprintln!(
                    "[alarm_scheduler] alarm id={} task_id={:?} fire_at={} fired_at={:?} missed={} now={now} due={}",
                    a.id, a.task_id, a.fire_at, a.fired_at, a.missed,
                    a.fire_at <= now
                );
    }

        }
    }

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
        eprintln!("[alarm_scheduler] no due alarms found");
        return Ok(0);
    }

    eprintln!("[alarm_scheduler] found {count} due alarm(s), firing...");

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
        eprintln!("[alarm_scheduler] emitting alarm-fired for id={}", alarm.id);
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
