use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_opened: i64,
    pub settings_json: String,
}

pub fn create_project(conn: &Connection, path: &str, name: &str) -> AppResult<Project> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO projects (id, path, name, last_opened) VALUES (?1, ?2, ?3, ?4)",
        params![id, path, name, now],
    )?;
    Ok(Project {
        id,
        path: path.to_string(),
        name: name.to_string(),
        last_opened: now,
        settings_json: "{}".to_string(),
    })
}

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT id, path, name, last_opened, settings_json FROM projects ORDER BY last_opened DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_opened: row.get(3)?,
            settings_json: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_project(conn: &Connection, id: &str) -> AppResult<Option<Project>> {
    let mut stmt = conn.prepare("SELECT id, path, name, last_opened, settings_json FROM projects WHERE id = ?1")?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_opened: row.get(3)?,
            settings_json: row.get(4)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn update_last_opened(conn: &Connection, id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE projects SET last_opened = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn rename_project(conn: &Connection, id: &str, name: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}
