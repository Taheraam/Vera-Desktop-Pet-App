mod db;
mod commands;

use tauri::Manager;

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
        .setup(|app| {
            // Seed last_alive_timestamp for missed-alarm catch-up
            let app_handle = app.handle().clone();
            db::seed_app_state(&app_handle)?;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running VeraPet app");
}

fn main() {
    run();
}
