use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::window;

pub fn start_detector(app: AppHandle) {
    std::thread::spawn(move || {
        let mut was_fullscreen = false;
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let is_fs = is_any_fullscreen();
            if is_fs && !was_fullscreen {
                if let Some(win) = app.get_webview_window("pet") {
                    let _ = win.hide();
                }
                let _ = app.emit("fullscreen-detected", serde_json::json!({}));
                was_fullscreen = true;
            } else if !is_fs && was_fullscreen {
                if let Some(win) = app.get_webview_window("pet") {
                    let _ = win.show();
                }
                // pet_mode is persisted and untouched while hidden; restore its look.
                if window::read_pet_mode(&app) == "awake" {
                    let _ = app.emit("fullscreen-cleared", serde_json::json!({}));
                } else {
                    let _ = app.emit("pet-state-changed", serde_json::json!({ "state": "asleep" }));
                }
                was_fullscreen = false;
            }
        }
    });
}

/// Window classes that cover the whole monitor but are part of the shell, not an app:
/// the desktop (Progman / WorkerW) and the taskbars.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn is_shell_window_class(class: &str) -> bool {
    matches!(
        class,
        "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
    )
}

/// A window counts as fullscreen when it covers the entire monitor rectangle
/// (not just the work area, which is what a maximized window covers).
/// Rects are (left, top, right, bottom).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn covers_monitor(window: (i32, i32, i32, i32), monitor: (i32, i32, i32, i32)) -> bool {
    window.0 <= monitor.0 && window.1 <= monitor.1 && window.2 >= monitor.2 && window.3 >= monitor.3
}

#[cfg(target_os = "windows")]
fn is_any_fullscreen() -> bool {
    unsafe {
        use windows::Win32::Foundation::{FALSE, HWND, RECT};
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId,
        };

        let hwnd = GetForegroundWindow();
        if hwnd == HWND::default() {
            return false;
        }

        // Our own windows (pet or utility) are never "a fullscreen app".
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }

        // Clicking the desktop focuses Progman/WorkerW, which is monitor-sized.
        let mut class_buf = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class_buf);
        if len > 0 {
            let class = String::from_utf16_lossy(&class_buf[..len as usize]);
            if is_shell_window_class(&class) {
                return false;
            }
        }

        let mut window_rect = RECT::default();
        if GetWindowRect(hwnd, &mut window_rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_invalid() {
            return false;
        }

        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut mi as *mut _) == FALSE {
            return false;
        }

        covers_monitor(
            (window_rect.left, window_rect.top, window_rect.right, window_rect.bottom),
            (mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom),
        )
    }
}

#[cfg(not(target_os = "windows"))]
fn is_any_fullscreen() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_and_taskbar_are_not_fullscreen_apps() {
        for c in ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"] {
            assert!(is_shell_window_class(c), "{c}");
        }
        assert!(!is_shell_window_class("Chrome_WidgetWin_1"));
    }

    #[test]
    fn fullscreen_means_whole_monitor_not_work_area() {
        let monitor = (0, 0, 1920, 1080);
        assert!(covers_monitor((0, 0, 1920, 1080), monitor));
        // Exclusive-fullscreen games often overshoot by a few pixels.
        assert!(covers_monitor((-8, -8, 1928, 1088), monitor));
        // Maximized window stops at the taskbar.
        assert!(!covers_monitor((0, 0, 1920, 1040), monitor));
        // Second monitor to the right.
        assert!(covers_monitor((1920, 0, 3840, 1080), (1920, 0, 3840, 1080)));
        assert!(!covers_monitor((0, 0, 1920, 1080), (1920, 0, 3840, 1080)));
    }
}
