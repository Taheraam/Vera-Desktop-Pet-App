mod db;
mod commands;

use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("verapet.db", db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        commands::hotkey::handle_call_pet(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Run migrations then seed last_alive_timestamp
            let app_handle = app.handle().clone();
            db::run_migrations(&app_handle)?;
            db::seed_app_state(&app_handle)?;

            // Start the alarm scheduler background thread
            commands::alarm_scheduler::start(app_handle.clone());

            // Initialize MCP and consent registries
            commands::mcp::init_registry(&app_handle)?;
            commands::agent::init_registry(&app_handle)?;

            // Start the fullscreen detector background thread
            commands::fullscreen::start_detector(app_handle.clone());

            // Create the pet window (transparent, always-on-top, 64x64)
            tauri::webview::WebviewWindowBuilder::new(
                app,
                "pet",
                tauri::WebviewUrl::App("src/pet-window/index.html".into()),
            )
            .title("VeraPet")
            .inner_size(64.0, 64.0)
            .transparent(true)
            .decorations(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()?;

            // Create the utility window (hidden by default)
            tauri::webview::WebviewWindowBuilder::new(
                app,
                "utility",
                tauri::WebviewUrl::App("src/utility-window/index.html".into()),
            )
            .title("VeraPet — Tasks & Notes")
            .inner_size(400.0, 600.0)
            .visible(false)
            .build()?;

            // Register the "Call Pet" global hotkey (Alt+P)
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyP);
            app.global_shortcut().register(shortcut)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::complete_task,
            commands::tasks::delete_task,
            commands::tasks::list_tasks,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::notes::list_notes,
            commands::alarms::create_alarm,
            commands::alarms::delete_alarm,
            commands::alarms::list_alarms,
            commands::alarms::get_missed_alarms_summary,
            commands::window::set_click_through,
            commands::window::get_pet_state,
            commands::window::set_auto_start,
            commands::window::get_monitor_layout,
            commands::gamification::ingest_dropped_content,
            commands::gamification::get_xp_state,
            commands::alarm_scheduler::debug_check_alarms,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running VeraPet app");
}

fn main() {
    run();
}
