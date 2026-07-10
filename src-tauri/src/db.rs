use tauri::{AppHandle, Manager};

const DB_NAME: &str = "verapet.db";

/// Get a connection to the SQLite database.
pub fn get_connection(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DB_NAME);

    std::fs::create_dir_all(db_path.parent().unwrap()).map_err(|e| e.to_string())?;

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Current Unix epoch seconds.
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// All migrations ordered by version. Each version is an atomic SQL batch.
/// Use tauri-plugin-sql's migration array — never a single raw init script.
pub fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![
        // ── v1: core tables (tasks, notes, alarms, app_state) ──
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create core tables",
            kind: tauri_plugin_sql::MigrationKind::Up,
            sql: r#"
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
        },
        // ── v2: provider credentials (Milestone 4) + agent actions audit log ──
        tauri_plugin_sql::Migration {
            version: 2,
            description: "add provider_credentials and agent_actions",
            kind: tauri_plugin_sql::MigrationKind::Up,
            sql: r#"
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
        },
    ]
}

/// Run all migrations inline using rusqlite (not tauri-plugin-sql).
/// Needed because tauri-plugin-sql only applies migrations when the frontend
/// opens a DB connection through its JS API, but the backend accesses the DB
/// directly via rusqlite and needs the tables to exist immediately.
pub fn run_migrations(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let conn = get_connection(app)?;
    for migration in migrations() {
        conn.execute_batch(&migration.sql)?;
    }
    Ok(())
}

/// Seed app_state with last_alive_timestamp on first launch.
pub fn seed_app_state(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let conn = get_connection(app)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('last_alive_timestamp', ?1)",
        [now()],
    )?;

    Ok(())
}
