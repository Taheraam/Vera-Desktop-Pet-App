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
        // ── v3: acknowledged_at for alarms (Milestone 6) ──
        tauri_plugin_sql::Migration {
            version: 3,
            description: "add acknowledged_at to alarms",
            kind: tauri_plugin_sql::MigrationKind::Up,
            sql: r#"
                ALTER TABLE alarms ADD COLUMN IF NOT EXISTS acknowledged_at INTEGER;
                CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged_at);
            "#,
        },
        // ── v4: greeting_message and settings defaults ──
        tauri_plugin_sql::Migration {
            version: 4,
            description: "add settings defaults to app_state",
            kind: tauri_plugin_sql::MigrationKind::Up,
            sql: r#"
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('render_engine', 'canvas');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('hotkey', 'Alt+P');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('auto_start_enabled', 'false');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('context_engine_enabled', 'true');
                INSERT OR IGNORE INTO app_state (key, value) VALUES ('greeting_message', 'Hi! I''m here to help you stay on track.');
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
        // v3 adds a column — check existence first (SQLite compat)
        if migration.version == 3 {
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('alarms') WHERE name='acknowledged_at'",
                [],
                |row| row.get(0),
            ).unwrap_or(0);
            if exists == 0 {
                conn.execute_batch("ALTER TABLE alarms ADD COLUMN acknowledged_at INTEGER;")?;
                conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged_at);")?;
            }
        } else {
            conn.execute_batch(&migration.sql)?;
        }
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

    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('pet_mode', 'awake')",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('greeting_message', 'Hi! I''m here to help you stay on track.')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('render_engine', 'canvas')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('hotkey', 'Alt+P')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('auto_start_enabled', 'false')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('context_engine_enabled', 'true')",
        [],
    )?;

    Ok(())
}
