use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::alarms::{row_to_alarm, Alarm, ALARM_COLUMNS};
use crate::commands::tasks::Task;
use crate::db;

/// Lets `create_alarm` wake the scheduler instead of waiting out its sleep.
pub struct SchedulerWake(pub Mutex<mpsc::Sender<()>>);

/// Wake the scheduler so a newly created alarm is picked up immediately.
pub fn wake(app: &AppHandle) {
    if let Some(w) = app.try_state::<SchedulerWake>() {
        if let Ok(tx) = w.0.lock() {
            let _ = tx.send(());
        }
    }
}

/// Start the alarm scheduler background thread.
/// It sleeps until the next alarm (max 60 s) or until `wake()` is called.
pub fn start(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<()>();
    app.manage(SchedulerWake(Mutex::new(tx)));

    std::thread::spawn(move || {
        let conn = match db::get_connection(&app) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[alarm_scheduler] failed to open DB: {e}");
                return;
            }
        };

        // Anything that came due while the app was closed is MISSED. It is not
        // "fired" now, because no window is listening yet and the user would never see it.
        match mark_missed_at_boot(&conn, db::now()) {
            Ok(n) if n > 0 => eprintln!("[alarm_scheduler] {n} alarm(s) missed while closed"),
            Err(e) => eprintln!("[alarm_scheduler] boot sweep failed: {e}"),
            _ => {}
        }

        loop {
            match fire_due_alarms(&app, &conn) {
                Ok(count) if count > 0 => eprintln!("[alarm_scheduler] fired {count} alarm(s)"),
                Err(e) => eprintln!("[alarm_scheduler] error: {e}"),
                _ => {}
            }
            let sleep_secs = next_alarm_delay(&conn, db::now());
            // Returns early when create_alarm calls wake().
            let _ = rx.recv_timeout(Duration::from_secs(sleep_secs));
        }
    });
}

/// Mark every unfired alarm whose time has passed as missed (and done).
pub fn mark_missed_at_boot(conn: &rusqlite::Connection, now: i64) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE alarms SET missed = 1, fired_at = ?1 WHERE fired_at IS NULL AND fire_at < ?1",
        rusqlite::params![now],
    )
}

/// Seconds until the next pending alarm, clamped to 1..=60.
pub fn next_alarm_delay(conn: &rusqlite::Connection, now: i64) -> u64 {
    match conn.query_row(
        "SELECT MIN(fire_at) FROM alarms WHERE fired_at IS NULL AND fire_at > ?1",
        rusqlite::params![now],
        |row| row.get::<_, Option<i64>>(0),
    ) {
        Ok(Some(next)) => (next - now).clamp(1, 60) as u64,
        _ => 60,
    }
}

/// Alarms that are due and not yet fired.
pub fn due_alarms(conn: &rusqlite::Connection, now: i64) -> rusqlite::Result<Vec<Alarm>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ALARM_COLUMNS} FROM alarms WHERE fire_at <= ?1 AND fired_at IS NULL ORDER BY fire_at ASC"
    ))?;
    let rows = stmt.query_map(rusqlite::params![now], row_to_alarm)?;
    rows.collect()
}

/// Returns the number of alarms fired.
fn fire_due_alarms(app: &AppHandle, conn: &rusqlite::Connection) -> Result<usize, String> {
    let now = db::now();
    let alarms = due_alarms(conn, now).map_err(|e| e.to_string())?;

    for alarm in &alarms {
        let task = alarm.task_id.and_then(|tid| {
            conn.query_row(
                "SELECT id, title, notes, due_at, completed_at, created_at FROM tasks WHERE id = ?1",
                rusqlite::params![tid],
                crate::commands::tasks::row_to_task,
            )
            .ok()
        });
        let task: Option<Task> = task;

        conn.execute(
            "UPDATE alarms SET fired_at = ?1 WHERE id = ?2",
            rusqlite::params![now, alarm.id],
        )
        .map_err(|e| e.to_string())?;

        let _ = app.emit("alarm-fired", serde_json::json!({ "alarm": alarm, "task": task }));
    }

    // Bring the reminder in front of the user; the utility window shows the ringing banner.
    if !alarms.is_empty() {
        if let Some(win) = app.get_webview_window("utility") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }

    Ok(alarms.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_alarm(conn: &rusqlite::Connection, fire_at: i64) -> i64 {
        conn.execute("INSERT INTO alarms (fire_at) VALUES (?1)", [fire_at]).unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn alarms_due_while_closed_become_missed_not_fired() {
        let conn = db::test_conn();
        let past = insert_alarm(&conn, 1_000);
        let future = insert_alarm(&conn, 9_000);

        assert_eq!(mark_missed_at_boot(&conn, 5_000).unwrap(), 1);

        let missed = crate::commands::alarms::unacknowledged_missed(&conn).unwrap();
        assert_eq!(missed.len(), 1);
        assert_eq!(missed[0].id, past);
        // The past alarm must not ring again, and the future one is untouched.
        assert!(due_alarms(&conn, 5_000).unwrap().is_empty());
        assert_eq!(due_alarms(&conn, 9_000).unwrap()[0].id, future);
    }

    #[test]
    fn delay_tracks_next_alarm_and_caps_at_sixty() {
        let conn = db::test_conn();
        assert_eq!(next_alarm_delay(&conn, 0), 60);
        insert_alarm(&conn, 10);
        assert_eq!(next_alarm_delay(&conn, 0), 10);
        insert_alarm(&conn, 500);
        assert_eq!(next_alarm_delay(&conn, 100), 60);
    }
}
