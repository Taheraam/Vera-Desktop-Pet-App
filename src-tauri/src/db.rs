use rusqlite::Connection;
use tauri::{AppHandle, Manager};

const DB_NAME: &str = "verapet.db";

/// Get a connection to the SQLite database.
pub fn get_connection(app: &AppHandle) -> Result<Connection, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DB_NAME);

    if let Some(dir) = db_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    configure(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Per-connection settings. `busy_timeout` stops the background threads and
/// command handlers from failing with SQLITE_BUSY when they write at the same time.
pub fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
}

/// Current Unix epoch seconds.
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// One schema step. `version` is stored in `PRAGMA user_version`, so each step
/// runs exactly once per database, inside its own transaction.
struct Migration {
    version: i64,
    apply: fn(&Connection) -> rusqlite::Result<()>,
}

const MIGRATIONS: &[Migration] = &[
    // v1: core tables
    Migration {
        version: 1,
        apply: |c| {
            c.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    notes TEXT,
                    due_at INTEGER,
                    completed_at INTEGER,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                );
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_markdown TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                );
                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                    fire_at INTEGER NOT NULL,
                    fired_at INTEGER,
                    missed BOOLEAN NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_alarms_fire_at ON alarms(fire_at);
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                "#,
            )
        },
    },
    // v2: provider credentials + agent audit log
    Migration {
        version: 2,
        apply: |c| {
            c.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS provider_credentials (
                    provider TEXT PRIMARY KEY CHECK (provider IN ('openai','anthropic','gemini')),
                    keychain_ref TEXT NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 0,
                    last_verified_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS agent_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    delegation_id TEXT NOT NULL,
                    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
                    provider TEXT NOT NULL,
                    mcp_server TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    target_summary TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN (
                        'pending_consent','approved','executed','denied','failed','expired'
                    )),
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    resolved_at INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON agent_actions(status);
                CREATE INDEX IF NOT EXISTS idx_agent_actions_delegation ON agent_actions(delegation_id);
                "#,
            )
        },
    },
    // v3: acknowledged_at for alarms. Databases created before versioning may
    // already have the column, so check first (SQLite has no ADD COLUMN IF NOT EXISTS).
    Migration {
        version: 3,
        apply: |c| {
            let exists: i64 = c.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('alarms') WHERE name = 'acknowledged_at'",
                [],
                |row| row.get(0),
            )?;
            if exists == 0 {
                c.execute_batch("ALTER TABLE alarms ADD COLUMN acknowledged_at INTEGER;")?;
            }
            c.execute_batch("CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged_at);")
        },
    },
    // v4: settings defaults. The context engine (window-title tracking) is opt-in.
    Migration {
        version: 4,
        apply: |c| {
            c.execute_batch(
                r#"
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('render_engine', 'canvas');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('hotkey', 'Alt+P');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('auto_start_enabled', 'false');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('context_engine_enabled', 'false');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('greeting_message', 'Hi! I''m here to help you stay on track.');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('pet_mode', 'awake');
                "#,
            )
        },
    },
];

/// Highest schema version this build knows about.
#[cfg(test)]
pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

/// Apply every migration newer than the database's `user_version`.
pub fn apply_migrations(conn: &Connection) -> rusqlite::Result<i64> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for m in MIGRATIONS.iter().filter(|m| m.version > current) {
        let tx = conn.unchecked_transaction()?;
        (m.apply)(&tx)?;
        tx.pragma_update(None, "user_version", m.version)?;
        tx.commit()?;
    }
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Run migrations at startup, before any window or background thread opens the DB.
pub fn run_migrations(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let conn = get_connection(app)?;
    apply_migrations(&conn)?;
    Ok(())
}

/// In-memory database with the full schema, for unit tests.
#[cfg(test)]
pub fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    configure(&conn).unwrap();
    apply_migrations(&conn).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_reaches_latest_version() {
        let conn = test_conn();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, latest_version());
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = test_conn();
        assert_eq!(apply_migrations(&conn).unwrap(), latest_version());
    }

    #[test]
    fn upgrades_a_pre_versioning_database_that_already_has_acknowledged_at() {
        // Databases from older builds: tables + column exist, user_version is still 0.
        let conn = Connection::open_in_memory().unwrap();
        (MIGRATIONS[0].apply)(&conn).unwrap();
        (MIGRATIONS[1].apply)(&conn).unwrap();
        conn.execute_batch("ALTER TABLE alarms ADD COLUMN acknowledged_at INTEGER;").unwrap();
        assert_eq!(apply_migrations(&conn).unwrap(), latest_version());
    }

    #[test]
    fn context_engine_is_opt_in_on_new_installs() {
        let conn = test_conn();
        let v: String = conn
            .query_row("SELECT value FROM app_state WHERE key = 'context_engine_enabled'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "false");
    }
}
