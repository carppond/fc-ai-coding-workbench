English | [中文](README.zh-CN.md)

# ShiGuang AI Coding Platform

A desktop coding assistant integrating AI chat, Git workflow, and terminal, built with Tauri 2. Supports macOS, Windows, and Linux.

## Features

- **AI Chat (In Development)** — Pre-built interfaces for Anthropic Claude and OpenAI models; currently uses the built-in terminal to run Claude CLI for AI-assisted coding
- **Git Integration** — File-level staging/unstaging, commit, push/pull, branch tracking, commit log, diff preview
- **Built-in Terminal** — Multi-tab terminal supporting zsh/bash/fish/PowerShell with custom prompt and full keyboard shortcut support
- **File Management** — Project file tree browsing, search, create/rename/delete
- **Network Proxy** — HTTP/HTTPS/SOCKS5 proxy support, one-click apply to Git, npm, terminal, and API requests
- **Claude Resume Auto-Save** — Automatically saves the resume command when exiting Claude CLI (macOS/Linux)
- **Multiple Themes** — 14 built-in themes (Catppuccin Mocha/Latte, Dracula, Nord, Tokyo Night, etc.)
- **Bilingual UI** — Switch between Chinese and English with one click
- **Secure Storage** — API keys encrypted via system keychain

## Screenshots

> Coming soon

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 19 + TypeScript + Vite |
| State Management | Zustand |
| Backend | Rust |
| Database | SQLite (rusqlite) |
| Git | libgit2 (git2-rs) |
| Terminal | portable-pty + xterm.js |
| HTTP | reqwest (with SOCKS5 support) |
| Key Storage | keyring (macOS Keychain / Linux Secret Service) |

## Prerequisites

- **Node.js** >= 18
- **Rust** >= 1.70
- **System Dependencies**
  - macOS: Xcode Command Line Tools
  - Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), Visual Studio Build Tools
  - Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`

## Quick Start

```bash
# Clone the repository
git clone https://github.com/carppond/fc-ai-coding-workbench.git
cd fc-ai-coding-workbench

# Install frontend dependencies
npm install

# Run in development mode
cargo tauri dev

# Build for production (current platform)
cargo tauri build
```

### macOS Packaging

```bash
# Current architecture
cargo tauri build

# Universal Binary (Intel + Apple Silicon)
cargo tauri build --target universal-apple-darwin
```

You can also use the provided build script:

```bash
chmod +x build-dmg.sh
./build-dmg.sh          # Current architecture
./build-dmg.sh universal # Universal Binary
```

## Project Structure

```
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI Components
│   │   ├── layout/         # Layout (TopBar, AppShell)
│   │   ├── left-panel/     # File tree, session list
│   │   ├── center-panel/   # Terminal, file preview
│   │   └── right-panel/    # Git operations panel
│   ├── stores/             # Zustand state management
│   ├── ipc/                # Tauri IPC command bindings
│   ├── lib/                # Utilities (i18n, type definitions)
│   └── styles/             # CSS styles
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── db/             # SQLite database layer
│   │   ├── git/            # Git operations
│   │   ├── terminal/       # Terminal PTY management
│   │   ├── providers/      # AI providers (Anthropic, OpenAI)
│   │   ├── proxy.rs        # Network proxy management
│   │   └── state.rs        # Application state
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/      # CI/CD (GitHub Actions, 3-platform build)
├── package.json
└── vite.config.ts
```

## CI/CD

The project includes GitHub Actions for automated builds:

- **Manual Trigger** — Actions → `Build & Release` → `Run workflow`
- **Tag Trigger** — Push a `v*` tag to automatically build and create a GitHub Release

Build Artifacts:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (Universal Binary) |
| Windows | `.msi` + `.exe` |
| Linux | `.deb` + `.AppImage` |

## Notes

1. **API Key Security** — Keys are stored in the system keychain and never written to config files or the database
2. **Proxy Settings** — Proxy configuration in the settings panel is persisted to the database and auto-restored on restart
3. **Terminal Environment** — The built-in terminal inherits the system shell environment with a custom prompt; delete the corresponding temp file to restore the original prompt
4. **Git Operations** — To prevent accidental operations, staging automatically filters out `node_modules`, `.git`, `target`, and similar directories
5. **Data Storage** — Application data (database, settings) is stored in the system app data directory:
   - macOS: `~/Library/Application Support/com.shiguang.ai-coding/`
   - Windows: `%APPDATA%/com.shiguang.ai-coding/`
   - Linux: `~/.local/share/com.shiguang.ai-coding/`

## License

[MIT License](LICENSE)

## Contributing

Issues and Pull Requests are welcome.

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/xxx`)
3. Commit your changes (`git commit -m 'Add xxx'`)
4. Push the branch (`git push origin feature/xxx`)
5. Create a Pull Request
