use crate::db::migrations;
use crate::errors::AppError;
use crate::proxy;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Mutex, Once, RwLock};
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub cancel_tokens: Mutex<HashMap<String, watch::Sender<bool>>>,
    pub http_client: RwLock<reqwest::Client>,
    http_client_init: Once,
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

        // 读取代理设置并初始化全局代理状态（轻量操作，不构建 client）
        let proxy_url = crate::db::settings::get_setting(&conn, "proxy_url")
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());
        proxy::set_url(proxy_url);

        // HTTP client 使用空的默认值占位，首次使用时才真正初始化（延迟 TLS 堆栈加载）
        let placeholder_client = reqwest::Client::new();

        Ok(Self {
            db: Mutex::new(conn),
            cancel_tokens: Mutex::new(HashMap::new()),
            http_client: RwLock::new(placeholder_client),
            http_client_init: Once::new(),
        })
    }

    /// 确保 HTTP client 已用正确的代理配置初始化（首次调用时执行，后续跳过）
    pub fn ensure_http_client(&self) {
        self.http_client_init.call_once(|| {
            if let Ok(client) = proxy::build_http_client(proxy::get_url().as_deref()) {
                let mut guard = self.http_client.write().unwrap();
                *guard = client;
            }
        });
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
