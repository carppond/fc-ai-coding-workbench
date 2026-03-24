use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub project_ids_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn create_workspace(conn: &Connection, name: &str) -> AppResult<Workspace> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO workspaces (id, name, project_ids_json, created_at, updated_at) VALUES (?1, ?2, '[]', ?3, ?4)",
        params![id, name, now, now],
    )?;
    Ok(Workspace {
        id,
        name: name.to_string(),
        project_ids_json: "[]".to_string(),
        created_at: now,
        updated_at: now,
    })
}

pub fn list_workspaces(conn: &Connection) -> AppResult<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_ids_json, created_at, updated_at FROM workspaces ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            project_ids_json: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_workspace(conn: &Connection, id: &str) -> AppResult<Option<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_ids_json, created_at, updated_at FROM workspaces WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            project_ids_json: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn update_workspace(
    conn: &Connection,
    id: &str,
    name: &str,
    project_ids_json: &str,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE workspaces SET name = ?1, project_ids_json = ?2, updated_at = ?3 WHERE id = ?4",
        params![name, project_ids_json, now, id],
    )?;
    Ok(())
}

pub fn delete_workspace(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_workspace_timestamp(conn: &Connection, id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE workspaces SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}
