// Release builds on Windows: no console window behind the pet.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod commands;

use tauri::{Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DEFAULT_HOTKEY: &str = "Alt+P";

/// Parse the stored hotkey, falling back to Alt+P if it's missing or invalid.
fn wake_shortcut(stored: &str) -> Shortcut {
    stored
        .parse::<Shortcut>()
        .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::ALT), Code::KeyP))
}

fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch (autostart + manual) focuses the
        // running pet instead of starting a second scheduler that double-fires alarms.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("pet") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Only one shortcut is ever registered: the wake hotkey.
                    if event.state() == ShortcutState::Pressed {
                        commands::window::wake_from_hotkey(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_handle = app.handle().clone();
            db::run_migrations(&app_handle)?;

            // Background threads
            commands::alarm_scheduler::start(app_handle.clone());
            commands::fullscreen::start_detector(app_handle.clone());

            // MCP, consent and context registries
            commands::mcp::init_registry(&app_handle)?;
            commands::agent::init_registry(&app_handle)?;
            commands::context::init_registry(&app_handle)?;

            // Global wake hotkey. A clash with another app is logged, not fatal.
            let stored = commands::settings::read_setting(&app_handle, "hotkey", DEFAULT_HOTKEY);
            if let Err(e) = app.global_shortcut().register(wake_shortcut(&stored)) {
                eprintln!("[hotkey] could not register '{stored}': {e}");
            }

            // Pet window: transparent, always-on-top, 260x210 logical
            tauri::webview::WebviewWindowBuilder::new(
                app,
                "pet",
                tauri::WebviewUrl::App("src/pet-window/index.html".into()),
            )
            .title("VeraPet")
            .inner_size(260.0, 210.0)
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .minimizable(false)
            .closable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()?;

            // Position pet at the work-area corner on launch (DPI-aware)
            {
                let handle = app.handle().clone();
                let (cx, cy) = commands::window::compute_corner_target(&handle);
                if let Some(win) = handle.get_webview_window("pet") {
                    let _ = win.set_position(PhysicalPosition::new(cx, cy));
                }
            }

            // Utility window (hidden by default)
            tauri::webview::WebviewWindowBuilder::new(
                app,
                "utility",
                tauri::WebviewUrl::App("src/utility-window/index.html".into()),
            )
            .title("VeraPet — Tasks & Notes")
            .inner_size(400.0, 600.0)
            .visible(false)
            .build()?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the utility window used to destroy it, so double-clicking the
            // pet could never reopen it until restart. Hide it instead.
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "utility" => {
                api.prevent_close();
                let _ = window.hide();
            }
            // File drops are read here, from paths the OS supplied. The webview never
            // gets to name a file for the backend to read.
            tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. })
                if window.label() == "pet" =>
            {
                let app = window.app_handle().clone();
                let paths = paths.clone();
                std::thread::spawn(move || {
                    for p in paths {
                        if let Err(e) = commands::gamification::ingest_file(&app, &p) {
                            eprintln!("[drop] {}: {e}", p.display());
                        }
                    }
                });
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::complete_task,
            commands::tasks::reopen_task,
            commands::tasks::delete_task,
            commands::tasks::list_tasks,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::notes::list_notes,
            commands::alarms::create_alarm,
            commands::alarms::delete_alarm,
            commands::alarms::list_alarms,
            commands::alarms::get_missed_alarms_summary,
            commands::alarms::acknowledge_alarm,
            commands::window::set_pet_mode,
            commands::window::get_pet_state,
            commands::window::set_auto_start,
            commands::window::get_monitor_layout,
            commands::gamification::ingest_dropped_content,
            commands::gamification::get_xp_state,
            commands::provider::add_provider_key,
            commands::provider::remove_provider_key,
            commands::provider::verify_provider_key,
            commands::provider::list_providers,
            commands::provider::set_active_provider,
            commands::mcp::list_mcp_servers,
            commands::mcp::connect_mcp_server,
            commands::mcp::disconnect_mcp_server,
            commands::agent::delegate_task_to_agent,
            commands::agent::respond_to_consent_request,
            commands::agent::list_agent_actions,
            commands::context::get_current_context,
            commands::context::get_permission_status,
            commands::context::request_accessibility_permission,
            commands::context::set_context_engine,
            commands::settings::get_settings,
            commands::settings::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VeraPet app");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_hotkey_parses() {
        assert_eq!(wake_shortcut(DEFAULT_HOTKEY), Shortcut::new(Some(Modifiers::ALT), Code::KeyP));
    }

    #[test]
    fn invalid_hotkey_falls_back_to_alt_p() {
        assert_eq!(wake_shortcut("not a hotkey"), Shortcut::new(Some(Modifiers::ALT), Code::KeyP));
    }
}
