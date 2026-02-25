use crate::db::migrations;
use crate::errors::AppError;
use crate::proxy;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub cancel_tokens: Mutex<HashMap<String, watch::Sender<bool>>>,
    pub http_client: RwLock<reqwest::Client>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, AppError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");
        std::fs::create_dir_all(&app_dir)?;

        let db_path = app_dir.join("workbench.db");
        let mut conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        migrations::run_migrations(&mut conn)?;

        // Load proxy URL from database settings
        let proxy_url = crate::db::settings::get_setting(&conn, "proxy_url")
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());

        // Initialize global proxy state
        proxy::set_url(proxy_url.clone());

        let http_client = proxy::build_http_client(proxy_url.as_deref())
            .map_err(|e| AppError::General(e.to_string()))?;

        Ok(Self {
            db: Mutex::new(conn),
            cancel_tokens: Mutex::new(HashMap::new()),
            http_client: RwLock::new(http_client),
        })
    }

    /// Rebuild the HTTP client with the current proxy setting.
    pub fn rebuild_http_client(&self) -> Result<(), AppError> {
        let url = proxy::get_url();
        let new_client = proxy::build_http_client(url.as_deref())
            .map_err(|e| AppError::General(e.to_string()))?;
        let mut guard = self.http_client.write().unwrap();
        *guard = new_client;
        Ok(())
    }
}
