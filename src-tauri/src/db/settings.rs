use rusqlite::{params, Connection};
use serde_json::Value;

use crate::errors::AppResult;

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<Value>> {
    let mut stmt = conn.prepare("SELECT value_json FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| {
        let s: String = row.get(0)?;
        Ok(s)
    })?;
    match rows.next() {
        Some(Ok(s)) => Ok(Some(serde_json::from_str(&s)?)),
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &Value) -> AppResult<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let json = serde_json::to_string(value)?;
    conn.execute(
        "INSERT INTO settings (id, key, value_json, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![id, key, json, now],
    )?;
    Ok(())
}
