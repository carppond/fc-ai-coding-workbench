# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShiGuang AI Coding Platform (拾光 AI 编程平台) — a Tauri 2 desktop workbench: file tree + CodeMirror editor, multi-pane terminal that launches coding CLIs (OMP / Pi), and a Git panel. Supports macOS, Windows, and Linux.

OMP and Pi are coding *clients*; Claude / GPT are *models* configured inside those clients. The in-app Anthropic/OpenAI provider code and the chat components still exist but are **not mounted** in the UI — see "Retained but unmounted" below before describing or extending them.

## Commands

All commands run from the repo root.

```bash
npm install                                   # frontend deps
cargo tauri dev                               # dev window with hot reload
cargo tauri build                             # production build, current platform
cargo tauri build --target universal-apple-darwin   # macOS universal binary
npm run build                                 # tsc + vite build (frontend only)
npx tsc --noEmit                              # TypeScript type check
npm run test:file-tree                        # the only frontend test: tests/file-tree-git.test.mjs (node --test)
cd src-tauri && cargo check                   # Rust compile check
cd src-tauri && cargo test                    # Rust tests
```

No linter or formatter is configured. CI (`.github/workflows/build.yml`) runs `npm run test:file-tree` and `cargo test --locked` before packaging on each platform.

## Architecture

**Three-layer Tauri 2 architecture:**

1. **Frontend** (`src/`) — React 19 + TypeScript 5.7 + Vite 6. Six Zustand stores in `src/stores/`: `projectStore`, `fileStore`, `gitStore`, `settingsStore` drive the UI; `chatStore` and `sessionStore` are only referenced by the unmounted chat components.
2. **IPC bridge** (`src/ipc/commands.ts`) — ~100 typed `invoke` wrappers, one per Rust command.
3. **Backend** (`src-tauri/src/`) — Rust. 93 `#[tauri::command]` handlers registered in `lib.rs`, grouped in 8 `commands/*` modules (`db`, `git`, `provider`, `project`, `terminal`, `keychain`, `env`, `setup`).

All frontend↔backend communication is Tauri IPC + events — no REST API.

### UI Layout

`AppShell` = `TopBar` + Allotment three panes (left 280px / center flex / right 350px) + `QuickOpen`. With no project open, a "workspace-start" section (Open Project button) renders above the panes. There is no setup wizard and no onboarding flag; `loadSettings` / `loadProjects` / `loadLocale` run on mount and the environment check is deferred 3s.

- **Left** (`left-panel/`) — `FileTree` (per-repo Git decorations from `gitStore.repoStates[project.path]`, separate unsaved dot from `fileStore.isDirty`), `FileSearchPanel`. No session list.
- **Center** (`center-panel/`) — terminal tabs (max 5) with binary-tree split panes (max 4 per tab, `layoutTree.ts`), `FileViewer` (CodeMirror 6), coding-CLI launcher (new / `--continue` / `--resume`), `CodingCliSettings`, `ToolSetupDialog`.
- **Right** (`right-panel/`) — `GitOverview` (+ `BranchSelector`: list / checkout / create / delete), `GitStatusList` (stage / unstage / discard, conflict resolve ours / theirs), `GitDiffView`, `GitActions` (commit, AI commit message, push / pull, merge abort), `GitStash`, `GitLog` (log + tags create / delete / push).
- **TopBar** — open project, `EnvironmentSetup`, proxy settings, theme, locale, `GuideModal`, `CodingCliSettings`.

### Backend Modules

- `commands/mod.rs` — `run_blocking` (4-permit Tokio `Semaphore` for sync fs / libgit2 work; the permit is held until the worker actually finishes) and `command_output_with_timeout` (async child stdin/stdout with a deadline).
- `commands/*_commands.rs` — one file per domain (see Architecture).
- `coding_cli.rs` — `CodingCli` (omp | pi), `CliLaunchConfig`, `resolve_program` (honours explicit extensions and `PATHEXT`, never searches the project cwd), argv construction, OMP approval modes (Pi rejects them), Windows PowerShell/CMD quoting.
- `terminal/mod.rs` + `terminal/flow_control.rs` — portable-pty sessions, shell detection and prompt setup, capability env vars, bounded output flow control, stale temp-file cleanup.
- `git/mod.rs` — local operations via libgit2 (git2-rs): status, diff, stage, commit, branches, stash, tags, `checkout_branch` (refuses when tracked files are dirty). `run_git` shells out to the Git CLI with a timeout for `pull`, `push`, `push_tag`, `init_repo` fetch/checkout, `resolve_ours` / `resolve_theirs`, `merge_abort` — so a missing Git binary blocks those but never the libgit2 paths. Staging skips `node_modules`, `.git`, `target` and similar.
- `db/` — SQLite via rusqlite, WAL mode, foreign-key cascades. Tables: `workspaces`, `projects`, `sessions`, `threads`, `messages` (+ `messages_fts` FTS5), `templates`, `settings`. Schema in `db/migrations.rs`.
- `providers/` — `anthropic.rs` / `openai.rs` SSE clients (retained, no UI entry).
- `keychain/` — keyring crate with `apple-native`, `windows-native`, `sync-secret-service`.
- `proxy.rs` + `state.rs` — global proxy URL; `AppState` holds the DB mutex, stream cancel tokens and a lazily built reqwest client (`rebuild_http_client` on proxy change).

### Key Design Patterns

- **Coding CLI launch**: `CenterPanel` uses the focused terminal pane's real cwd (not the Git context path). Busy or unverified-ready terminals refuse to launch; unsaved files prompt first. "New session" for OMP passes a temporary run config with `autoResume: false` instead of bare `omp`. Approval: OMP `default` adds nothing, `always-ask` → `--approval-mode=always-ask`, `auto-approve` → `--auto-approve` (confirmed in UI). Settings keys: `coding_cli`, `omp_approval_mode`.
- **AI commit message**: `generate_commit_message` runs the selected CLI in print mode (`--print --no-session --no-tools --no-extensions`), prompt + diff via stdin, 60s deadline; returns text only, never commits.
- **Git refresh**: `gitStore.refreshRepo(path, withBranch = true)` per repo; `repoStates` keyed by path with per-repo sequence numbers to drop stale responses; only `activeRepoPath` updates the flat right-panel view. `RightPanel` polls the effective path every 5s with exponential backoff (max 30s), pauses on window blur, refreshes on focus, and refreshes other selected repos serially. `fileStore.saveFile` schedules `refreshRepo(root, false)` immediately after a successful write.
- **Paths** (`src/lib/fileTreeGit.ts`): `fileNameFromPath` / `parentDirectory` / `joinProjectPath` preserve raw IO spelling (drive letters, UNC, `\\?\`, mixed separators). `normalizePathKey` is comparison-only (Windows case/separator folding) — never pass it to the filesystem or terminal. `findProjectRoot` picks the longest matching root on directory boundaries.
- **Editor**: `FileViewer` keeps immutable CodeMirror `Text` snapshots and uses `doc.eq` for dirty state; saving preserves the undo stack. Documents ≥ 5 × 1024 × 1024 UTF-16 code units open in lightweight mode. `openFileVersion` isolates late reads / saves / language loads.
- **Terminal flow control**: PTY output goes through a bounded channel; at most 256 KiB / 8 unacknowledged chunks in flight. Frontend ACKs via `acknowledge_terminal_output` only after `xterm.write` has parsed the chunk, so hidden tabs keep ANSI ordering.
- **Terminal warmup**: `WARMUP_POOL_SIZE = 3` PTYs pre-spawned in one target directory (`warmup_terminal(dir)` retargets the pool, evicting shells started elsewhere and counting in-flight spawns). `claim_warmup_terminal(dir)` only hands out a shell started in `dir`; otherwise the frontend calls `spawn_terminal(dir)`. The working directory is fixed at spawn — nothing is ever typed into a shell to `cd` it, because input typed while a slow profile is still loading can be lost. `AppShell` warms up after `loadProjects` resolves, with the restored project's path.
- **Child-process detection**: `terminal_commands.rs::inspect_children` uses `sysinfo` (cross-platform) and matches real executables or Node/Bun entry scripts — no `pgrep`, no `contains("pi")`.
- **Keychain**: in-app provider API keys live in the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service), never in the DB. OMP / Pi manage their own logins; the app never copies credentials or writes shell config.
- **Proxy**: HTTP / HTTPS / SOCKS5 from settings, applied to Git, npm, terminal env and API requests.
- **i18n**: `src/lib/i18n.ts` — `translations: Record<"zh" | "en", Record<string, string>>` with dot-separated keys (e.g. `"git.commit"`).
- **AI streaming (unmounted)**: `send_message` → SSE → `stream-chunk-{threadId}` Tauri event → `chatStore` accumulates.

## Coding Conventions

- 2-space indent (TS/CSS), rustfmt defaults (Rust)
- Components PascalCase, functions/variables camelCase (TS), snake_case (Rust)
- Zustand stores: `create<State>((set, get) => ({...}))`
- IPC: frontend `invoke<T>(cmd, params)` → backend `#[tauri::command] async fn`
- Errors: `AppResult<T> = Result<T, AppError>`, frontend shows toast
- CSS: BEM naming (`.git-actions__input`), CSS variables for theming (themes in `styles/global.css`)

## Key File Lookup

|Task|Files|
|---|---|
|Add Tauri command|`src-tauri/src/commands/` + `lib.rs` registration|
|Add IPC call|`src/ipc/commands.ts`|
|Coding CLI launch / approval|`src/lib/codingCli.ts`, `CenterPanel.tsx`, `src-tauri/src/coding_cli.rs`, `commands/terminal_commands.rs`|
|Tool detection / install|`common/EnvironmentSetup.tsx`, `common/ToolSetupDialog.tsx`, `commands/setup_commands.rs`|
|Terminal split layout|`center-panel/layoutTree.ts` + `CenterPanel.tsx`|
|Terminal PTY / flow control|`center-panel/Terminal.tsx`, `src-tauri/src/terminal/`|
|Terminal host shortcuts|`src/lib/terminalShortcuts.ts`|
|File editor|`center-panel/FileViewer.tsx` + `editorTheme.ts` + `editorLanguages.ts`, `stores/fileStore.ts`|
|File tree Git decorations / path rules|`src/lib/fileTreeGit.ts`, `left-panel/FileTree.tsx`, `tests/file-tree-git.test.mjs`|
|Git panel UI|`src/components/right-panel/`, `stores/gitStore.ts`|
|Git backend|`src-tauri/src/git/mod.rs`, `commands/git_commands.rs`|
|Add theme|`src/styles/global.css` + `stores/settingsStore.ts`|
|Add translation|`src/lib/i18n.ts` (zh + en sections)|
|DB migration|`src-tauri/src/db/migrations.rs`|

## Hardcoded Limits

|Limit|Value|Location|
|---|---|---|
|Git status entries|500|`git/mod.rs` `MAX_STATUS_ENTRIES`|
|Git diff bytes|512 KB|`git/mod.rs` `MAX_DIFF_BYTES`|
|Git log entries|50|`git/mod.rs` `revwalk.take(50)`|
|Search results|200 (default `max_results`)|`project_commands.rs`|
|Search matches per file|10|`project_commands.rs`|
|Search file size|1 000 000 bytes|`project_commands.rs`|
|File read size|200 MB default (`max_size` param)|`project_commands.rs` `read_file_content`|
|Lightweight editor threshold|5 × 1024 × 1024 chars|`FileViewer.tsx` `LARGE_FILE_CHAR_THRESHOLD`|
|Commit msg gen timeout|60s|`provider_commands.rs`|
|CLI version probe timeout|5s|`setup_commands.rs`, `provider_commands.rs`|
|Blocking worker permits|4|`commands/mod.rs` `BLOCKING_TASKS`|
|Terminal output window|256 KiB / 8 chunks|`terminal/flow_control.rs`|
|Terminal warmup pool|3|`terminal_commands.rs` `WARMUP_POOL_SIZE`|
|Terminal tabs / panes per tab|5 / 4|`CenterPanel.tsx` `MAX_TABS`, `MAX_PANES_PER_TAB`|
|Git poll interval / max backoff|5s / 30s|`RightPanel.tsx` `POLL_INTERVAL`, `MAX_BACKOFF`|
|Git status visible rows|100|`GitStatusList.tsx` `VISIBLE_LIMIT`|
|Diff lines|3000|`GitDiffView.tsx` `MAX_DIFF_LINES`|
|Search panel rows|50|`FileSearchPanel.tsx` `DISPLAY_LIMIT`|
|Quick-open results|20|`QuickOpen.tsx` `MAX_RESULTS`|
|Anthropic max_tokens (unmounted)|8192|`providers/anthropic.rs`|
|OpenAI temperature (unmounted)|0.7|`providers/openai.rs`|

## Retained but unmounted

Code that exists but has no entry point in the current UI. Do not list it as a shipped feature; delete or wire it deliberately.

- Chat UI: `center-panel/MessageList.tsx`, `MessageItem.tsx`, `Composer.tsx`, `ProviderModelModeBar.tsx`, `ContextInjectBar.tsx`, `common/SearchResults.tsx` — not imported by `CenterPanel` or `AppShell`.
- `stores/chatStore.ts`, `stores/sessionStore.ts`, `src/hooks/useKeyboardShortcuts.ts` — only referenced by the above.
- `right-panel/RepoSection.tsx` — not imported anywhere.
- Backend: `send_message` / `stop_streaming` / `test_api_key`, `providers/*` (3 hardcoded system prompts: `code`, `ask`, `architect`), `search_messages`.
- DB: `templates` table, `sessions.tags_json`, `threads.source_thread_id`, `threads.handoff_meta_json`, `messages_fts` — schema exists, no store / UI uses them.

## Platform Notes

- **macOS**: Xcode Command Line Tools required. Universal binary via `--target universal-apple-darwin`.
- **Windows**: WebView2 + VS Build Tools required. `vite.config.ts` binds `127.0.0.1` by default (`TAURI_DEV_HOST` overrides) — Tauri cannot connect to the IPv6 default. `keyring` must keep the `windows-native` feature or keys fall into a non-persistent mock backend.
- **Linux**: Requires `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`.
- **App data**: `com.shiguang.ai-coding` in the platform's standard app data directory.

### Windows Terminal Caveats

- `terminal/mod.rs::setup_terminal_capabilities` **removes** `TERM_PROGRAM` / `TERM_FEATURES` on Windows (ConPTY swallows capability queries, TUI apps hang) and sets them to `ShiGuang` / `truecolor:clipboard:title:hyperlinks` elsewhere. A unit test enforces this.
- Shell detection probes files only, in order `pwsh.exe` → `powershell.exe` → `cmd.exe`; no subprocess is spawned. PowerShell runs `-NoLogo -NoExit`; CMD runs `/K chcp 65001`. Console I/O is UTF-8 without BOM; execution policy is never changed.
- Working directory is set at spawn (`CommandBuilder::cwd`). CMD cannot start in a UNC share, so `cmd.exe` is launched with `/K "pushd <share> && chcp 65001 >nul"` instead; UNC paths containing `%`, `!` or `"` are rejected rather than mangled.
- Host shortcuts (`src/lib/terminalShortcuts.ts`): Windows / Linux use Ctrl+Shift+C/V/F/K/W; macOS uses Command. Plain Ctrl+W/F/P are left to the CLI; Ctrl+C without a selection interrupts.
- Windows runtime behaviour (legacy ConPTY shutdown, real UNC shares) has unit tests but no Windows machine / CI run yet.
