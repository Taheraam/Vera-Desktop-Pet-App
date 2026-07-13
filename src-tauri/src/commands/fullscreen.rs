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
                // Restore the preserved pet_mode
                let mode = window::read_pet_mode(&app);
                window::write_pet_mode(&app, &mode);

                if mode == "awake" {
                    // Was awake → play waking_up animation
                    let _ = app.emit("fullscreen-cleared", serde_json::json!({}));
                } else {
                    // Was asleep → just reappear, no waking_up
                    let _ = app.emit(
                        "pet-state-changed",
                        serde_json::json!({ "state": "asleep" }),
                    );
                }
                was_fullscreen = false;
            }
        }
    });
}

#[cfg(target_os = "windows")]
fn is_any_fullscreen() -> bool {
    unsafe {
        use windows::Win32::Foundation::{FALSE, HWND, RECT};
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

        let hwnd = GetForegroundWindow();
        if hwnd == HWND::default() {
            return false;
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

        let ww = window_rect.right - window_rect.left;
        let wh = window_rect.bottom - window_rect.top;
        let mw = mi.rcMonitor.right - mi.rcMonitor.left;
        let mh = mi.rcMonitor.bottom - mi.rcMonitor.top;

        ww >= mw * 95 / 100 && wh >= mh * 95 / 100
    }
}

#[cfg(not(target_os = "windows"))]
fn is_any_fullscreen() -> bool {
    false
}
