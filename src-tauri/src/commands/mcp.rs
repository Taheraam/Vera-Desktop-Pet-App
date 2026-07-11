use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// In-memory registry of connected MCP servers.
/// In a full implementation this would manage actual MCP client connections
/// (stdio/TCP transport, tool discovery, call dispatch).
/// For now, it stores server configs and provides the framework for future wiring.
pub struct McpRegistry {
    pub servers: HashMap<String, McpServer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub connected_at: i64,
    #[serde(skip)]
    pub config: Option<String>,
}

#[tauri::command]
pub fn list_mcp_servers(app: AppHandle) -> Result<Vec<McpServer>, String> {
    let state = app.state::<Mutex<McpRegistry>>();
    let registry = state.lock().map_err(|e| e.to_string())?;
    let mut servers: Vec<McpServer> = registry.servers.values().cloned().collect();
    servers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(servers)
}

#[tauri::command]
pub fn connect_mcp_server(app: AppHandle, name: String, config: serde_json::Value) -> Result<McpServer, String> {
    let state = app.state::<Mutex<McpRegistry>>();
    let mut registry = state.lock().map_err(|e| e.to_string())?;

    if registry.servers.contains_key(&name) {
        return Err(format!("MCP server '{}' is already connected", name));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let server = McpServer {
        name: name.clone(),
        connected_at: now,
        config: Some(config.to_string()),
    };

    registry.servers.insert(name, server.clone());
    Ok(server)
}

#[tauri::command]
pub fn disconnect_mcp_server(app: AppHandle, name: String) -> Result<(), String> {
    let state = app.state::<Mutex<McpRegistry>>();
    let mut registry = state.lock().map_err(|e| e.to_string())?;

    registry.servers.remove(&name).ok_or_else(|| format!("MCP server '{}' is not connected", name))?;
    Ok(())
}

pub fn init_registry(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Mutex::new(McpRegistry {
        servers: HashMap::new(),
    }));
    Ok(())
}
