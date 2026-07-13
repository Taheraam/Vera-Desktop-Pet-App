use tauri::{AppHandle, Emitter, Manager};

use super::window::{self, PetMode};

/// Handle the "Call Pet" hotkey (Alt+P by default).
///
/// Two-state resolution per PRD §3.1:
/// | Current state | Action |
/// |---|---|
/// | hidden (fullscreen suppressed) | Un-hide, restore previous pet_mode |
/// | awake | Transition to asleep (walk to corner) |
/// | asleep | Transition to awake (wake in place) |
pub fn handle_call_pet(app: &AppHandle) {
    let current = get_computed_state(app);

    match current.as_str() {
        "hidden" => {
            // Un-hide the pet window and restore previous mode
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            // Restore previous pet_mode (read from DB, default "awake")
            let prev = window::read_pet_mode(app);
            window::write_pet_mode(app, &prev);
            let _ = app.emit(
                "pet-state-changed",
                serde_json::json!({ "state": prev }),
            );
            // Note: no pet-relocate here — we show at current position, not re-walk to corner
        }
        "awake" => {
            // Transition to asleep
            let _ = window::do_set_pet_mode(app, PetMode::Asleep);
        }
        "asleep" => {
            // Transition to awake
            let _ = window::do_set_pet_mode(app, PetMode::Awake);
        }
        _ => {}
    }
}

/// Compute the current state: hidden if window not visible, else read pet_mode.
fn get_computed_state(app: &AppHandle) -> String {
    let is_visible = app
        .get_webview_window("pet")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if !is_visible {
        return "hidden".to_string();
    }

    window::read_pet_mode(app)
}
