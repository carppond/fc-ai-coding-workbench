use rusqlite::Connection;

use crate::errors::AppResult;

pub fn run_migrations(conn: &mut Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id            TEXT PRIMARY KEY,
            path          TEXT NOT NULL UNIQUE,
            name          TEXT NOT NULL,
            last_opened   INTEGER NOT NULL,
            settings_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            title       TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            tags_json   TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS threads (
            id                TEXT PRIMARY KEY,
            session_id        TEXT NOT NULL,
            title             TEXT NOT NULL,
            provider          TEXT NOT NULL,
            last_model        TEXT NOT NULL,
            last_mode         TEXT NOT NULL,
            created_at        INTEGER NOT NULL,
            updated_at        INTEGER NOT NULL,
            source_thread_id  TEXT,
            handoff_meta_json TEXT NOT NULL DEFAULT '{}',
            pinned            INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(source_thread_id) REFERENCES threads(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         TEXT PRIMARY KEY,
            thread_id  TEXT NOT NULL,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            provider   TEXT NOT NULL,
            model      TEXT NOT NULL,
            mode       TEXT NOT NULL,
            meta_json  TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS templates (
            id          TEXT PRIMARY KEY,
            project_id  TEXT,
            name        TEXT NOT NULL,
            content     TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            id         TEXT PRIMARY KEY,
            key        TEXT NOT NULL UNIQUE,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at ASC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name_project ON templates(project_id, name);

        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            content='messages',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TABLE IF NOT EXISTS workspaces (
            id               TEXT PRIMARY KEY,
            name             TEXT NOT NULL,
            project_ids_json TEXT NOT NULL DEFAULT '[]',
            created_at       INTEGER NOT NULL,
            updated_at       INTEGER NOT NULL
        );
        ",
    )?;
    Ok(())
}
