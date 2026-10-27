English | [中文](README.zh-CN.md)

# ShiGuang AI Coding Platform

A desktop AI coding workbench integrating Git workflow, terminal, and AI provider interfaces, built with Tauri 2 for macOS, Windows, and Linux. Use OMP or Pi as coding clients with Claude, GPT, or other models supported by the selected CLI and your provider/account configuration.

## Features

- **AI Chat (In Development)** — Anthropic/Claude and OpenAI/GPT provider interfaces remain available, independently of terminal CLI login and model configuration
- **Git Integration** — File-level staging/unstaging, commit, push/pull, branch tracking, commit log, diff preview
- **Built-in Terminal** — Multi-tab terminal supporting zsh/bash/fish/PowerShell with custom prompt and full keyboard shortcut support; bounded output flow control preserves ordered ANSI data in hidden tabs
- **File Management** — Project file tree browsing, search, create/rename/delete; Git decorations are scoped to each repository, with a separate dot for unsaved editor changes
- **File Editing** — CodeMirror editing with undo-aware saved snapshots; large files use a lightweight mode that retains editing, search, undo and save
- **On-demand Environment Setup** — Enter the workbench directly; check/install the relevant tool when needed. Local detection is independent of background update checks, with shared requests and subprocess deadlines
- **Network Proxy** — HTTP/HTTPS/SOCKS5 proxy support, one-click apply to Git, npm, terminal, and API requests
- **Coding CLI Sessions** — OMP by default, remembered CLI selection, and New / Continue / Choose session actions; approval controls follow each CLI's capabilities
- **Multiple Themes** — Built-in themes include Catppuccin Mocha/Latte, Dracula, Nord, Tokyo Night, and more; switch from the top bar
- **Bilingual UI** — Switch between Chinese and English with one click
- **Secure Storage** — In-app provider API keys use the system keychain; OMP and Pi retain their own authentication and model configuration

## Entering the workbench

- Startup keeps a lightweight loading placeholder, then opens the workbench without a setup wizard or completion flag.
- With no project open, use **Open Project** to choose a folder. The terminal is already usable; opening the first project starts a terminal in that project's directory.
- A missing selected CLI offers **Check / install OMP/Pi** beside the terminal actions. The setup dialog shows only that CLI and its installation requirements: native OMP needs no Node.js, npm, or Bun; Pi's npm channel requires Node.js/npm.
- Pull/push and AI commit-message generation check the tool they actually use. Missing external Git does not gate libgit2-based local operations; commit-only remains separate from commit-and-push.
- Settings retains the full environment manager. Existing provider/model choices, CLI selection, approval settings, appearance preferences, credentials, and histories are preserved.

## Coding CLI workflow

- Choose OMP or Pi in the terminal toolbar or settings. These are coding clients, not models; choose Claude, GPT, or another supported model inside the selected CLI. Its login/model configuration is independent of the in-app AI provider/model settings.
- The three actions use the current terminal pane's working directory. Busy or unverifiable terminals reject launches rather than injecting commands into a running TUI.
- **New** always starts fresh. For OMP, a temporary per-run `autoResume: false` overlay prevents a global auto-resume preference from changing this action; the user's configuration is not rewritten.
- **Continue** uses `--continue`; **Choose session** opens the CLI's `--resume` picker. Histories remain managed separately by each CLI.
- OMP offers Follow configuration, Ask every time, and Auto-approve all tools. The last option includes command execution and requires explicit confirmation. Pi has no equivalent selector; its `--approve` flag is project trust, not per-tool approval.
- Commit-message generation uses the selected CLI in ephemeral, tool-free print mode. It produces text only and does not run `omp commit` or create a Git commit.
- Existing coding-client files, shell configuration, credentials, and histories are left untouched. Switching clients does not convert or delete another client's configuration or history.

### Windows terminal and paths

- PowerShell 7 is preferred, followed by Windows PowerShell and then CMD. Shell detection does not execute profiles; interactive PowerShell loads its normal profiles once and uses UTF-8 input/output. The app does not change execution policy.
- Terminal search, clear, and close use **Ctrl+Shift+F/K/W** on Windows/Linux. **Ctrl+Shift+C/V** copies/pastes; Ctrl+V and right-click paste remain available. Bare Ctrl+W/F/P remain available to CLI editing/model shortcuts, and Ctrl+C without a selection interrupts. macOS retains Command shortcuts; the file editor still uses Ctrl+W to close.
- Multiline paste follows the foreground program's bracketed-paste mode, including CLIs launched from PowerShell, rather than guessing from the parent shell.
- Windows drive, UNC, and `\\?\` paths retain their filesystem spelling when opening/saving files; case and separators are normalized only for project/Git comparisons. Terminals start directly in the project directory; CMD maps UNC shares with `pushd` at startup. UNC paths CMD cannot quote safely are rejected; use PowerShell for those paths.
- Standard OMP/npm/Bun, Node.js, Git, and PowerShell installation directories are included in tool discovery and terminal PATH. Restart the app after changing a custom PATH location.
- In-app API keys use **Windows Credential Manager**. If an older Windows build lost a saved key, save it again after updating; this does not affect OMP/Pi's own authentication.

## Screenshots

These images show an earlier UI; the current CLI controls are described above.

| Main Interface | Memory Guide | Settings |
|:-:|:-:|:-:|
| ![Main Interface](screenshot/screenshot01.jpg) | ![Memory Guide](screenshot/screenshot02.jpg) | ![Settings](screenshot/screenshot03.jpg) |

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
| Key Storage | keyring (macOS Keychain / Windows Credential Manager / Linux Secret Service) |

## Prerequisites

- **Node.js** >= 18
- **Rust** — current stable toolchain
- **System Dependencies**
  - macOS: Xcode Command Line Tools
  - Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), Visual Studio Build Tools
  - Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`
- **Coding CLI runtime** — Native OMP needs neither Node.js nor Bun. Its Bun installation channel needs Bun >= 1.3.14; Pi's npm package needs Node.js >= 22.19.0 and npm.

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

Each platform runs `npm run test:file-tree` and `cargo test --locked` before packaging. Windows-only tests cover shell/script execution and credential persistence; running the suite on macOS/Linux does not exercise those Windows cases. ConPTY shutdown on older Windows and starting CMD in a real UNC share also require Windows runtime verification.

Build Artifacts:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (Universal Binary) |
| Windows | `.exe` (NSIS) |
| Linux | `.deb` + `.AppImage` |

## Notes

1. **API Key Security** — In-app provider keys remain in the system keychain. CLI login and model settings belong to OMP/Pi; the app does not copy keys or write shell API variables.
2. **Proxy Settings** — Proxy configuration in the settings panel is persisted to the database and auto-restored on restart
3. **Terminal Environment** — The terminal inherits the process environment and customizes its prompt for the current session without rewriting user shell profiles.
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
