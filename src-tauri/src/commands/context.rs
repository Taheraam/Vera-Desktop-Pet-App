use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContextState {
    Coding,
    Browsing,
    Idle,
    Unknown,
}

impl ContextState {
    fn as_str(&self) -> &'static str {
        match self {
            ContextState::Coding => "coding",
            ContextState::Browsing => "browsing",
            ContextState::Idle => "idle",
            ContextState::Unknown => "unknown",
        }
    }
}

pub struct ContextEngine {
    pub current: Arc<Mutex<ContextState>>,
    pub enabled: Arc<AtomicBool>,
}

pub fn init_registry(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let enabled = is_engine_enabled(app);

    let current = Arc::new(Mutex::new(ContextState::Unknown));
    let enabled_flag = Arc::new(AtomicBool::new(enabled));

    app.manage(ContextEngine {
        current: current.clone(),
        enabled: enabled_flag.clone(),
    });

    // Always start the background thread so toggling on later works.
    // When disabled, the thread just sleeps and checks the flag every 2s.
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut last_context: Option<ContextState> = None;
        let mut last_title: Option<String> = None;
        let mut last_activity = Instant::now();
        let idle_timeout = Duration::from_secs(30);

        loop {
            std::thread::sleep(Duration::from_secs(2));

            if !enabled_flag.load(Ordering::Relaxed) {
                continue;
            }

            let title = get_foreground_title();
            let now = Instant::now();

            if title != last_title {
                last_activity = now;
                last_title = title.clone();
            }

            let is_idle = now.duration_since(last_activity) >= idle_timeout;

            let ctx = if is_idle {
                ContextState::Idle
            } else if let Some(ref t) = title {
                categorize_title(t)
            } else {
                ContextState::Unknown
            };

            let changed = match &last_context {
                Some(ref last) => ctx.as_str() != last.as_str(),
                None => true,
            };

            if changed {
                let serialized = serde_json::json!({ "context": ctx.as_str() });
                let _ = app_handle.emit("context-changed", serialized);
                if let Ok(mut c) = current.lock() {
                    *c = ctx.clone();
                }
                last_context = Some(ctx);
            }
        }
    });

    Ok(())
}

fn is_engine_enabled(app: &AppHandle) -> bool {
    let conn = match db::get_connection(app) {
        Ok(c) => c,
        Err(_) => return false,
    };
    conn.query_row(
        "SELECT value FROM app_state WHERE key = 'context_engine_enabled'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|v| v == "true")
    .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn get_foreground_title() -> Option<String> {
    unsafe {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

        let hwnd = GetForegroundWindow();
        if hwnd == HWND::default() {
            return None;
        }
        let mut buffer = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buffer, buffer.len() as i32);
        if len > 0 {
            let s = String::from_utf16_lossy(&buffer[..len as usize]);
            if s.is_empty() { None } else { Some(s) }
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_foreground_title() -> Option<String> {
    None
}

fn categorize_title(title: &str) -> ContextState {
    let lower = title.to_lowercase();

    // Code editors / IDEs / terminals
    let coding_patterns = [
        "visual studio code", "vscode", "code -",
        "intellij", "webstorm", "pycharm", "goland", "clion", "rubymine",
        "android studio",
        "vim", "nvim", "neovim", "emacs",
        "sublime text",
        "atom",
        "xcode",
        "eclipse",
        "terminal", "windows terminal", "powershell", "command prompt", "cmd.exe",
        "wsl", "mintty", "alacritty",
        "notepad++", "notepad",
        "git bash", "cygwin",
    ];

    for pat in coding_patterns {
        if lower.contains(pat) {
            return ContextState::Coding;
        }
    }

    // Browsers
    let browser_patterns = [
        "google chrome", "chrome",
        "mozilla firefox", "firefox",
        "microsoft edge", "edge",
        "brave", "opera", "vivaldi",
    ];

    for pat in browser_patterns {
        if lower.contains(pat) {
            return ContextState::Browsing;
        }
    }

    ContextState::Unknown
}

// ── Tauri Commands ───────────────────────────────────────────────

#[tauri::command]
pub fn get_current_context(app: AppHandle) -> Result<ContextState, String> {
    let state = app.state::<ContextEngine>();
    let ctx = state.current.lock().map_err(|e| e.to_string())?;
    Ok(ctx.clone())
}

#[tauri::command]
pub fn get_permission_status(app: AppHandle) -> Result<PermissionStatus, String> {
    let conn = db::get_connection(&app)?;
    let enabled: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'context_engine_enabled'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "false".to_string());

    #[cfg(target_os = "windows")]
    let accessibility = true;

    #[cfg(not(target_os = "windows"))]
    let accessibility = false;

    Ok(PermissionStatus {
        accessibility,
        context_engine_enabled: enabled == "true",
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub accessibility: bool,
    pub context_engine_enabled: bool,
}

#[tauri::command]
pub fn request_accessibility_permission() -> Result<PermissionGranted, String> {
    #[cfg(target_os = "macos")]
    {
        return Ok(PermissionGranted { granted: false });
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionGranted { granted: true })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionGranted {
    pub granted: bool,
}

#[tauri::command]
pub fn set_context_engine(app: AppHandle, enabled: bool) -> Result<(), String> {
    let conn = db::get_connection(&app)?;
    let val = if enabled { "true" } else { "false" };
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('context_engine_enabled', ?1)",
        [val],
    )
    .map_err(|e| e.to_string())?;

    let state = app.state::<ContextEngine>();
    state.enabled.store(enabled, Ordering::Relaxed);

    Ok(())
}
