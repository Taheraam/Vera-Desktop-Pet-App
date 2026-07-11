use keyring::Entry;
use serde::Serialize;
use tauri::AppHandle;

use crate::db;

const KEYRING_SERVICE: &str = "VeraPet";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub is_active: bool,
    pub last_verified_at: Option<i64>,
}

#[tauri::command]
pub fn add_provider_key(app: AppHandle, provider: String, api_key: String) -> Result<(), String> {
    let valid_providers = ["openai", "anthropic", "gemini"];
    if !valid_providers.contains(&provider.as_str()) {
        return Err(format!("Invalid provider: {}. Must be one of: openai, anthropic, gemini", provider));
    }

    // Store in OS keychain
    let entry = Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    entry.set_password(&api_key).map_err(|e| e.to_string())?;

    // Save reference in SQLite
    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO provider_credentials (provider, keychain_ref, is_active)
         VALUES (?1, ?2, COALESCE((SELECT is_active FROM provider_credentials WHERE provider = ?1), 0))",
        rusqlite::params![provider, format!("keyring:{}:{}", KEYRING_SERVICE, provider)],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_provider_key(app: AppHandle, provider: String) -> Result<(), String> {
    // Remove from keychain
    let entry = Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential(); // ignore if already gone

    // Remove from SQLite
    let conn = db::get_connection(&app)?;
    conn.execute(
        "DELETE FROM provider_credentials WHERE provider = ?1",
        rusqlite::params![provider],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn verify_provider_key(app: AppHandle, provider: String) -> Result<serde_json::Value, String> {
    let conn = db::get_connection(&app)?;

    // Check if provider exists in DB
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM provider_credentials WHERE provider = ?1",
            rusqlite::params![provider],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if !exists {
        return Ok(serde_json::json!({ "valid": false, "error": "No API key configured for this provider" }));
    }

    // Get key from keychain
    let entry = Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    let api_key = match entry.get_password() {
        Ok(k) => k,
        Err(_) => {
            return Ok(serde_json::json!({ "valid": false, "error": "Failed to read API key from keychain" }));
        }
    };

    // Make a lightweight verification call
    let valid = verify_with_provider(&provider, &api_key);

    // Update last_verified_at
    let now = db::now();
    conn.execute(
        "UPDATE provider_credentials SET last_verified_at = ?1 WHERE provider = ?2",
        rusqlite::params![now, provider],
    )
    .map_err(|e| e.to_string())?;

    if valid {
        Ok(serde_json::json!({ "valid": true }))
    } else {
        Ok(serde_json::json!({ "valid": false, "error": "API key rejected by provider" }))
    }
}

#[tauri::command]
pub fn list_providers(app: AppHandle) -> Result<Vec<ProviderStatus>, String> {
    let conn = db::get_connection(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT provider, is_active, last_verified_at FROM provider_credentials ORDER BY provider",
        )
        .map_err(|e| e.to_string())?;

    let providers = stmt
        .query_map([], |row| {
            Ok(ProviderStatus {
                provider: row.get(0)?,
                is_active: row.get::<_, bool>(1)?,
                last_verified_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(providers)
}

#[tauri::command]
pub fn set_active_provider(app: AppHandle, provider: String) -> Result<(), String> {
    let conn = db::get_connection(&app)?;

    // Verify provider exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM provider_credentials WHERE provider = ?1",
            rusqlite::params![provider],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if !exists {
        return Err(format!("Provider '{}' is not configured. Add an API key first.", provider));
    }

    // Deactivate all, then activate the selected one
    conn.execute("UPDATE provider_credentials SET is_active = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE provider_credentials SET is_active = 1 WHERE provider = ?1",
        rusqlite::params![provider],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn verify_with_provider(provider: &str, api_key: &str) -> bool {
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(_) => return false,
    };
    rt.block_on(async {
        let client = reqwest::Client::new();
        match provider {
            "openai" => {
                let resp = client
                    .get("https://api.openai.com/v1/models")
                    .bearer_auth(api_key)
                    .send()
                    .await;
                matches!(resp, Ok(r) if r.status().is_success())
            }
            "anthropic" => {
                let resp = client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", api_key)
                    .header("anthropic-version", "2023-06-01")
                    .json(&serde_json::json!({
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "ping"}]
                    }))
                    .send()
                    .await;
                resp.is_ok()
            }
            "gemini" => {
                let url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
                    api_key
                );
                let resp = client
                    .post(&url)
                    .json(&serde_json::json!({
                        "contents": [{"parts": [{"text": "ping"}]}]
                    }))
                    .send()
                    .await;
                matches!(resp, Ok(r) if r.status().is_success())
            }
            _ => false,
        }
    })
}
