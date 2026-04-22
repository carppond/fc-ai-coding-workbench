# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShiGuang AI Coding Platform (拾光 AI 编程平台) — a desktop coding assistant integrating AI chat, Git workflow, and terminal. Built with Tauri 2 (Rust backend + React frontend). Supports macOS, Windows, and Linux.

## Commands

```bash
# Install frontend dependencies
npm install

# Development (launches Tauri dev window with hot reload)
cargo tauri dev

# Production build (current platform)
cargo tauri build

# TypeScript check + Vite build (frontend only)
npm run build

# Run Rust tests
cd src-tauri && cargo test

# Check Rust compilation
cd src-tauri && cargo check
```

There are no linters, formatters, or test suites configured for the frontend.

## Architecture

**Tauri 2 desktop app** with a three-layer architecture:

1. **Frontend** (`src/`) — React 19 + TypeScript + Vite. State managed by Zustand stores.
2. **IPC bridge** (`src/ipc/commands.ts`) — TypeScript bindings that call Rust backend via `@tauri-apps/api`. This single file defines ~100+ typed functions mapping to Rust command handlers.
3. **Backend** (`src-tauri/src/`) — Rust. Tauri command handlers, SQLite database, Git operations (libgit2), terminal PTY, AI provider HTTP clients.

All frontend-backend communication goes through Tauri IPC — there is no REST API.

### Frontend Layout

The UI is a three-panel layout (left/center/right) wrapped by `AppShell`:

- **Left panel** — File tree browser, file search, session list
- **Center panel** — Terminal (xterm.js), file viewer (CodeMirror 6), AI chat composer/messages
- **Right panel** — Git operations: status, staging, diff, commit, push/pull, branch, stash, log

Six Zustand stores in `src/stores/`: `chatStore`, `projectStore`, `fileStore`, `gitStore`, `settingsStore`, `sessionStore`.

### Backend Modules

- `commands/` — Tauri command handlers, one file per domain: `db_commands`, `git_commands`, `provider_commands`, `project_commands`, `terminal_commands`, `keychain_commands`, `env_commands`, `setup_commands`
- `db/` — SQLite layer with rusqlite. Tables: `projects`, `sessions`, `threads`, `messages`, `settings`. WAL mode with foreign keys.
- `git/` — libgit2 wrapper (git2-rs crate)
- `providers/` — AI API clients (Anthropic Claude, OpenAI). Streaming via SSE (eventsource-stream).
- `terminal/` — PTY session management (portable-pty)
- `state.rs` — `AppState` struct holding DB connection, lazy HTTP client, proxy config
- `lib.rs` — App setup and IPC handler registration (~160 handlers)

### Key Design Patterns

- **Lazy HTTP client**: reqwest client is initialized on first API call, not at startup. Rebuilt when proxy settings change.
- **Terminal warmup**: PTY sessions are pre-created on app start (fire-and-forget).
- **Keychain storage**: API keys stored in OS keychain (macOS Keychain / Linux Secret Service), never in DB or config files.
- **Proxy support**: HTTP/HTTPS/SOCKS5 proxies configurable in settings, applied to Git, npm, terminal env, and API requests.
- **i18n**: Bilingual UI (Chinese/English) via `src/lib/i18n.ts` — a single file with all translation strings.

## Tech Stack Quick Reference

| Layer | Technology |
|-------|------------|
| Desktop framework | Tauri 2 |
| Frontend | React 19, TypeScript 5.7, Vite 6 |
| State | Zustand 5 |
| Editor | CodeMirror 6 |
| Terminal | xterm.js 6 + portable-pty |
| Backend | Rust (edition 2021) |
| Database | SQLite (rusqlite, bundled) |
| Git | git2 0.19 (vendored OpenSSL) |
| HTTP | reqwest 0.12 (rustls-tls, SOCKS5) |
| Async | Tokio 1 |
| CI/CD | GitHub Actions (3-platform matrix) |

## Platform Notes

- **macOS**: Xcode Command Line Tools required. Universal binary via `cargo tauri build --target universal-apple-darwin`.
- **Windows**: WebView2 runtime + Visual Studio Build Tools required.
- **Linux**: Requires `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`.
- **App data**: stored at `com.shiguang.ai-coding` in the platform's standard app data directory.
- Git staging auto-filters `node_modules`, `.git`, `target`, and similar directories.
