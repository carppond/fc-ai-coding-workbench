use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub tags_json: String,
}

pub fn create_session(conn: &Connection, project_id: &str, title: &str) -> AppResult<Session> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, project_id, title, now, now],
    )?;
    Ok(Session {
        id,
        project_id: project_id.to_string(),
        title: title.to_string(),
        created_at: now,
        updated_at: now,
        pinned: false,
        tags_json: "[]".to_string(),
    })
}

pub fn list_sessions(conn: &Connection, project_id: &str) -> AppResult<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, created_at, updated_at, pinned, tags_json FROM sessions WHERE project_id = ?1 ORDER BY pinned DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Session {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            pinned: row.get::<_, i32>(5)? != 0,
            tags_json: row.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_sessions(conn: &Connection) -> AppResult<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, created_at, updated_at, pinned, tags_json FROM sessions ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Session {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            pinned: row.get::<_, i32>(5)? != 0,
            tags_json: row.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_session(conn: &Connection, id: &str) -> AppResult<Option<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, created_at, updated_at, pinned, tags_json FROM sessions WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Session {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            pinned: row.get::<_, i32>(5)? != 0,
            tags_json: row.get(6)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn update_session(conn: &Connection, id: &str, title: Option<&str>, pinned: Option<bool>) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    if let Some(title) = title {
        conn.execute(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, id],
        )?;
    }
    if let Some(pinned) = pinned {
        conn.execute(
            "UPDATE sessions SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
            params![pinned as i32, now, id],
        )?;
    }
    Ok(())
}

pub fn delete_session(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
    Ok(())
}
