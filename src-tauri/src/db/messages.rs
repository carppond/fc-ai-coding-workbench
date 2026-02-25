use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
    pub provider: String,
    pub model: String,
    pub mode: String,
    pub meta_json: String,
}

pub fn create_message(
    conn: &Connection,
    thread_id: &str,
    role: &str,
    content: &str,
    provider: &str,
    model: &str,
    mode: &str,
) -> AppResult<Message> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO messages (id, thread_id, role, content, created_at, provider, model, mode) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, thread_id, role, content, now, provider, model, mode],
    )?;

    // Update thread's updated_at
    conn.execute(
        "UPDATE threads SET updated_at = ?1 WHERE id = ?2",
        params![now, thread_id],
    )?;

    // Also update the parent session's updated_at
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = (SELECT session_id FROM threads WHERE id = ?2)",
        params![now, thread_id],
    )?;

    Ok(Message {
        id,
        thread_id: thread_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        created_at: now,
        provider: provider.to_string(),
        model: model.to_string(),
        mode: mode.to_string(),
        meta_json: "{}".to_string(),
    })
}

pub fn list_messages(conn: &Connection, thread_id: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, role, content, created_at, provider, model, mode, meta_json FROM messages WHERE thread_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![thread_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            provider: row.get(5)?,
            model: row.get(6)?,
            mode: row.get(7)?,
            meta_json: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search_messages(conn: &Connection, query: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT m.id, m.thread_id, m.role, m.content, m.created_at, m.provider, m.model, m.mode, m.meta_json FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE messages_fts MATCH ?1 ORDER BY m.created_at DESC LIMIT 50",
    )?;
    let rows = stmt.query_map(params![query], |row| {
        Ok(Message {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            provider: row.get(5)?,
            model: row.get(6)?,
            mode: row.get(7)?,
            meta_json: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
