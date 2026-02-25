use crate::db::migrations;
use crate::errors::AppError;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub cancel_tokens: Mutex<HashMap<String, watch::Sender<bool>>>,
    pub http_client: reqwest::Client,
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

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| AppError::General(e.to_string()))?;

        Ok(Self {
            db: Mutex::new(conn),
            cancel_tokens: Mutex::new(HashMap::new()),
            http_client,
        })
    }
}
