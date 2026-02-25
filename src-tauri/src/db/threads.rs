use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Thread {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub provider: String,
    pub last_model: String,
    pub last_mode: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub source_thread_id: Option<String>,
    pub handoff_meta_json: String,
    pub pinned: bool,
}

pub fn create_thread(
    conn: &Connection,
    session_id: &str,
    title: &str,
    provider: &str,
    model: &str,
    mode: &str,
    source_thread_id: Option<&str>,
    handoff_meta_json: Option<&str>,
) -> AppResult<Thread> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let handoff = handoff_meta_json.unwrap_or("{}");
    conn.execute(
        "INSERT INTO threads (id, session_id, title, provider, last_model, last_mode, created_at, updated_at, source_thread_id, handoff_meta_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, session_id, title, provider, model, mode, now, now, source_thread_id, handoff],
    )?;

    // Update session's updated_at
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        params![now, session_id],
    )?;

    Ok(Thread {
        id,
        session_id: session_id.to_string(),
        title: title.to_string(),
        provider: provider.to_string(),
        last_model: model.to_string(),
        last_mode: mode.to_string(),
        created_at: now,
        updated_at: now,
        source_thread_id: source_thread_id.map(|s| s.to_string()),
        handoff_meta_json: handoff.to_string(),
        pinned: false,
    })
}

pub fn list_threads(conn: &Connection, session_id: &str) -> AppResult<Vec<Thread>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, title, provider, last_model, last_mode, created_at, updated_at, source_thread_id, handoff_meta_json, pinned FROM threads WHERE session_id = ?1 ORDER BY pinned DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map(params![session_id], |row| {
        Ok(Thread {
            id: row.get(0)?,
            session_id: row.get(1)?,
            title: row.get(2)?,
            provider: row.get(3)?,
            last_model: row.get(4)?,
            last_mode: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            source_thread_id: row.get(8)?,
            handoff_meta_json: row.get(9)?,
            pinned: row.get::<_, i32>(10)? != 0,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_thread(conn: &Connection, id: &str) -> AppResult<Option<Thread>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, title, provider, last_model, last_mode, created_at, updated_at, source_thread_id, handoff_meta_json, pinned FROM threads WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Thread {
            id: row.get(0)?,
            session_id: row.get(1)?,
            title: row.get(2)?,
            provider: row.get(3)?,
            last_model: row.get(4)?,
            last_mode: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            source_thread_id: row.get(8)?,
            handoff_meta_json: row.get(9)?,
            pinned: row.get::<_, i32>(10)? != 0,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn update_thread(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    last_model: Option<&str>,
    last_mode: Option<&str>,
    pinned: Option<bool>,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    if let Some(title) = title {
        conn.execute(
            "UPDATE threads SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, id],
        )?;
    }
    if let Some(model) = last_model {
        conn.execute(
            "UPDATE threads SET last_model = ?1, updated_at = ?2 WHERE id = ?3",
            params![model, now, id],
        )?;
    }
    if let Some(mode) = last_mode {
        conn.execute(
            "UPDATE threads SET last_mode = ?1, updated_at = ?2 WHERE id = ?3",
            params![mode, now, id],
        )?;
    }
    if let Some(pinned) = pinned {
        conn.execute(
            "UPDATE threads SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
            params![pinned as i32, now, id],
        )?;
    }
    Ok(())
}

pub fn delete_thread(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM threads WHERE id = ?1", params![id])?;
    Ok(())
}
