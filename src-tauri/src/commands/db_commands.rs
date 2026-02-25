use crate::db;
use crate::errors::{AppError, AppResult};
use crate::proxy;
use crate::state::AppState;
use tauri::State;

/// Helper: lock the DB mutex, converting a poisoned lock into an AppError.
fn lock_db<'a>(state: &'a State<'a, AppState>) -> AppResult<std::sync::MutexGuard<'a, rusqlite::Connection>> {
    state
        .db
        .lock()
        .map_err(|_| AppError::General("Database lock poisoned".to_string()))
}

// --- Projects ---

#[tauri::command]
pub fn create_project(state: State<AppState>, path: String, name: String) -> AppResult<db::projects::Project> {
    let conn = lock_db(&state)?;
    db::projects::create_project(&conn, &path, &name)
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> AppResult<Vec<db::projects::Project>> {
    let conn = lock_db(&state)?;
    db::projects::list_projects(&conn)
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> AppResult<Option<db::projects::Project>> {
    let conn = lock_db(&state)?;
    db::projects::get_project(&conn, &id)
}

#[tauri::command]
pub fn update_project_last_opened(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::projects::update_last_opened(&conn, &id)
}

#[tauri::command]
pub fn rename_project(state: State<AppState>, id: String, name: String) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::projects::rename_project(&conn, &id, &name)
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::projects::delete_project(&conn, &id)
}

// --- Sessions ---

#[tauri::command]
pub fn create_session(state: State<AppState>, project_id: String, title: String) -> AppResult<db::sessions::Session> {
    let conn = lock_db(&state)?;
    db::sessions::create_session(&conn, &project_id, &title)
}

#[tauri::command]
pub fn list_sessions(state: State<AppState>, project_id: String) -> AppResult<Vec<db::sessions::Session>> {
    let conn = lock_db(&state)?;
    db::sessions::list_sessions(&conn, &project_id)
}

#[tauri::command]
pub fn list_all_sessions(state: State<AppState>) -> AppResult<Vec<db::sessions::Session>> {
    let conn = lock_db(&state)?;
    db::sessions::list_all_sessions(&conn)
}

#[tauri::command]
pub fn get_session(state: State<AppState>, id: String) -> AppResult<Option<db::sessions::Session>> {
    let conn = lock_db(&state)?;
    db::sessions::get_session(&conn, &id)
}

#[tauri::command]
pub fn update_session(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    pinned: Option<bool>,
) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::sessions::update_session(&conn, &id, title.as_deref(), pinned)
}

#[tauri::command]
pub fn delete_session(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::sessions::delete_session(&conn, &id)
}

// --- Threads ---

#[tauri::command]
pub fn create_thread(
    state: State<AppState>,
    session_id: String,
    title: String,
    provider: String,
    model: String,
    mode: String,
    source_thread_id: Option<String>,
    handoff_meta_json: Option<String>,
) -> AppResult<db::threads::Thread> {
    let conn = lock_db(&state)?;
    db::threads::create_thread(
        &conn,
        &session_id,
        &title,
        &provider,
        &model,
        &mode,
        source_thread_id.as_deref(),
        handoff_meta_json.as_deref(),
    )
}

#[tauri::command]
pub fn list_threads(state: State<AppState>, session_id: String) -> AppResult<Vec<db::threads::Thread>> {
    let conn = lock_db(&state)?;
    db::threads::list_threads(&conn, &session_id)
}

#[tauri::command]
pub fn get_thread(state: State<AppState>, id: String) -> AppResult<Option<db::threads::Thread>> {
    let conn = lock_db(&state)?;
    db::threads::get_thread(&conn, &id)
}

#[tauri::command]
pub fn update_thread(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    last_model: Option<String>,
    last_mode: Option<String>,
    pinned: Option<bool>,
) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::threads::update_thread(
        &conn,
        &id,
        title.as_deref(),
        last_model.as_deref(),
        last_mode.as_deref(),
        pinned,
    )
}

#[tauri::command]
pub fn delete_thread(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::threads::delete_thread(&conn, &id)
}

// --- Messages ---

#[tauri::command]
pub fn create_message(
    state: State<AppState>,
    thread_id: String,
    role: String,
    content: String,
    provider: String,
    model: String,
    mode: String,
) -> AppResult<db::messages::Message> {
    let conn = lock_db(&state)?;
    db::messages::create_message(&conn, &thread_id, &role, &content, &provider, &model, &mode)
}

#[tauri::command]
pub fn list_messages(state: State<AppState>, thread_id: String) -> AppResult<Vec<db::messages::Message>> {
    let conn = lock_db(&state)?;
    db::messages::list_messages(&conn, &thread_id)
}

#[tauri::command]
pub fn search_messages(state: State<AppState>, query: String) -> AppResult<Vec<db::messages::Message>> {
    let conn = lock_db(&state)?;
    db::messages::search_messages(&conn, &query)
}

// --- Settings ---

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> AppResult<Option<serde_json::Value>> {
    let conn = lock_db(&state)?;
    db::settings::get_setting(&conn, &key)
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: serde_json::Value) -> AppResult<()> {
    let conn = lock_db(&state)?;
    db::settings::set_setting(&conn, &key, &value)
}

// --- Proxy ---

#[tauri::command]
pub fn set_proxy(state: State<AppState>, url: String) -> AppResult<()> {
    // 1. Save to database
    let conn = lock_db(&state)?;
    let value = if url.trim().is_empty() {
        serde_json::Value::String(String::new())
    } else {
        serde_json::Value::String(url.trim().to_string())
    };
    db::settings::set_setting(&conn, "proxy_url", &value)?;
    drop(conn);

    // 2. Update global proxy state
    let clean_url = if url.trim().is_empty() { None } else { Some(url.trim().to_string()) };
    proxy::set_url(clean_url);

    // 3. Rebuild HTTP client with new proxy
    state.rebuild_http_client()?;

    Ok(())
}

#[tauri::command]
pub fn get_proxy() -> AppResult<Option<String>> {
    Ok(proxy::get_url())
}
