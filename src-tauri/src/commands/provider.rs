use std::time::Duration;

use keyring::Entry;
use serde::Serialize;
use tauri::AppHandle;

use crate::db;

const KEYRING_SERVICE: &str = "VeraPet";
pub const VALID_PROVIDERS: [&str; 3] = ["openai", "anthropic", "gemini"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub is_active: bool,
    pub last_verified_at: Option<i64>,
}

fn check_provider(provider: &str) -> Result<(), String> {
    if VALID_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("Invalid provider: {provider}. Must be one of: openai, anthropic, gemini"))
    }
}

/// Shared HTTP client for provider calls. Every request has a timeout, so a
/// hung provider can't leave a command or the agent thread waiting forever.
pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.without_url().to_string())
}

#[tauri::command]
pub fn add_provider_key(app: AppHandle, provider: String, api_key: String) -> Result<(), String> {
    check_provider(&provider)?;
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("API key can't be empty".into());
    }

    // Store in OS keychain (Windows Credential Manager); SQLite only keeps a reference.
    let entry = Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    entry.set_password(api_key).map_err(|e| e.to_string())?;

    let conn = db::get_connection(&app)?;
    conn.execute(
        "INSERT INTO provider_credentials (provider, keychain_ref, is_active)
         VALUES (?1, ?2, 0)
         ON CONFLICT(provider) DO UPDATE SET keychain_ref = excluded.keychain_ref, last_verified_at = NULL",
        rusqlite::params![provider, format!("keyring:{KEYRING_SERVICE}:{provider}")],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_provider_key(app: AppHandle, provider: String) -> Result<(), String> {
    check_provider(&provider)?;
    let entry = Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential(); // ignore if already gone

    let conn = db::get_connection(&app)?;
    conn.execute(
        "DELETE FROM provider_credentials WHERE provider = ?1",
        rusqlite::params![provider],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Async: runs on Tauri's async runtime instead of the main thread, so a slow
/// provider can't freeze the windows.
#[tauri::command]
pub async fn verify_provider_key(app: AppHandle, provider: String) -> Result<serde_json::Value, String> {
    check_provider(&provider)?;
    let api_key = match Entry::new(KEYRING_SERVICE, &provider).and_then(|e| e.get_password()) {
        Ok(k) => k,
        Err(_) => {
            return Ok(serde_json::json!({ "valid": false, "error": "No API key configured for this provider" }))
        }
    };

    let client = http_client()?;
    let request = verify_request(&client, &provider, &api_key)?;
    let outcome = match client.execute(request).await {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => Err(format!("API key rejected by provider (HTTP {})", resp.status().as_u16())),
        // without_url(): never echo request URLs into errors shown to the user or logs.
        Err(e) => Err(format!("Could not reach provider: {}", e.without_url())),
    };

    match outcome {
        Ok(()) => {
            let conn = db::get_connection(&app)?;
            conn.execute(
                "UPDATE provider_credentials SET last_verified_at = ?1 WHERE provider = ?2",
                rusqlite::params![db::now(), provider],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "valid": true }))
        }
        Err(error) => Ok(serde_json::json!({ "valid": false, "error": error })),
    }
}

/// A cheap, read-only authenticated call per provider. Keys always travel in
/// headers, never in the URL.
pub fn verify_request(client: &reqwest::Client, provider: &str, api_key: &str) -> Result<reqwest::Request, String> {
    let builder = match provider {
        "openai" => client.get("https://api.openai.com/v1/models").bearer_auth(api_key),
        "anthropic" => client
            .get("https://api.anthropic.com/v1/models")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "gemini" => client
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", api_key),
        other => return Err(format!("Unknown provider: {other}")),
    };
    builder.build().map_err(|e| e.without_url().to_string())
}

#[tauri::command]
pub fn list_providers(app: AppHandle) -> Result<Vec<ProviderStatus>, String> {
    let conn = db::get_connection(&app)?;
    let mut stmt = conn
        .prepare("SELECT provider, is_active, last_verified_at FROM provider_credentials ORDER BY provider")
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
    check_provider(&provider)?;
    let mut conn = db::get_connection(&app)?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM provider_credentials WHERE provider = ?1",
            rusqlite::params![provider],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;
    if !exists {
        return Err(format!("Provider '{provider}' is not configured. Add an API key first."));
    }

    // One transaction, so there is never a moment with zero or two active providers.
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("UPDATE provider_credentials SET is_active = (provider = ?1)", rusqlite::params![provider])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "sk-test-SECRET-123";

    #[test]
    fn api_keys_never_appear_in_request_urls() {
        let client = http_client().unwrap();
        for p in VALID_PROVIDERS {
            let req = verify_request(&client, p, KEY).unwrap();
            assert!(!req.url().as_str().contains(KEY), "{p} leaks the key in its URL");
            let in_headers = req.headers().values().any(|v| v.to_str().unwrap_or("").contains(KEY));
            assert!(in_headers, "{p} must send the key in a header");
        }
    }

    #[test]
    fn unknown_providers_are_rejected() {
        assert!(check_provider("openai").is_ok());
        assert!(check_provider("evil").is_err());
    }
}
