# 拾光 AI 编程平台 (ShiGuang AI Coding Platform)

一款集成 AI 对话、Git 工作流和终端的桌面编程辅助工具，基于 Tauri 2 构建，支持 macOS、Windows 和 Linux。

## 功能特性

- **AI 对话（开发中）** — 已预留 Anthropic Claude、OpenAI 多模型接口，当前通过内置终端运行 Claude CLI 进行 AI 编程
- **Git 集成** — 文件级暂存/撤销、提交、推送/拉取、分支追踪、提交日志、差异预览
- **内置终端** — 多 Tab 终端，支持 zsh/bash/fish/PowerShell，自定义 prompt，完整的快捷键支持
- **文件管理** — 项目文件树浏览、搜索、新建/重命名/删除
- **网络代理** — 支持 HTTP/HTTPS/SOCKS5 代理，一键应用到 Git、npm、终端及 API 请求
- **Claude Resume 自动保存** — 退出 Claude CLI 时自动保存 resume 命令（macOS/Linux）
- **多主题** — 内置 14 款主题（Catppuccin Mocha/Latte、Dracula、Nord、Tokyo Night 等）
- **双语界面** — 中文 / English 一键切换
- **安全存储** — API 密钥通过系统钥匙串加密存储

## 截图

> 待添加

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri 2](https://v2.tauri.app/) |
| 前端 | React 19 + TypeScript + Vite |
| 状态管理 | Zustand |
| 后端 | Rust |
| 数据库 | SQLite (rusqlite) |
| Git | libgit2 (git2-rs) |
| 终端 | portable-pty + xterm.js |
| HTTP | reqwest (支持 SOCKS5) |
| 密钥存储 | keyring (macOS Keychain / Linux Secret Service) |

## 环境要求

- **Node.js** >= 18
- **Rust** >= 1.70
- **系统依赖**
  - macOS: Xcode Command Line Tools
  - Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)、Visual Studio Build Tools
  - Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`

## 快速开始

```bash
# 克隆项目
git clone https://github.com/carppond/fc-ai-coding-workbench.git
cd fc-ai-coding-workbench

# 安装前端依赖
npm install

# 开发模式运行
cargo tauri dev

# 构建发布版本（当前平台）
cargo tauri build
```

### macOS 打包

```bash
# 当前架构
cargo tauri build

# Universal Binary（同时支持 Intel + Apple Silicon）
cargo tauri build --target universal-apple-darwin
```

也可以使用项目提供的打包脚本：

```bash
chmod +x build-dmg.sh
./build-dmg.sh          # 当前架构
./build-dmg.sh universal # Universal Binary
```

## 项目结构

```
├── src/                    # 前端 (React + TypeScript)
│   ├── components/         # UI 组件
│   │   ├── layout/         # 布局 (TopBar, AppShell)
│   │   ├── left-panel/     # 文件树、会话列表
│   │   ├── center-panel/   # 终端、文件预览
│   │   └── right-panel/    # Git 操作面板
│   ├── stores/             # Zustand 状态管理
│   ├── ipc/                # Tauri IPC 命令绑定
│   ├── lib/                # 工具库 (i18n, 类型定义)
│   └── styles/             # CSS 样式
├── src-tauri/              # 后端 (Rust)
│   ├── src/
│   │   ├── commands/       # Tauri 命令处理
│   │   ├── db/             # SQLite 数据库层
│   │   ├── git/            # Git 操作
│   │   ├── terminal/       # 终端 PTY 管理
│   │   ├── providers/      # AI 提供商 (Anthropic, OpenAI)
│   │   ├── proxy.rs        # 网络代理管理
│   │   └── state.rs        # 应用状态
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/      # CI/CD (GitHub Actions 三平台构建)
├── package.json
└── vite.config.ts
```

## CI/CD

项目配置了 GitHub Actions 自动构建：

- **手动触发** — Actions → `Build & Release` → `Run workflow`
- **Tag 触发** — 推送 `v*` 标签自动构建并创建 GitHub Release

构建产物：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` (Universal Binary) |
| Windows | `.msi` + `.exe` |
| Linux | `.deb` + `.AppImage` |

## 注意事项

1. **API 密钥安全** — 密钥存储在系统钥匙串中，不会写入配置文件或数据库
2. **代理设置** — 设置面板中的代理配置会持久化到数据库，重启应用后自动恢复
3. **终端环境** — 内置终端会继承系统 shell 环境并自定义 prompt，如需恢复原始 prompt 可删除对应临时文件
4. **Git 操作** — 为避免误操作，暂存时会自动过滤 `node_modules`、`.git`、`target` 等目录
5. **数据存储** — 应用数据（数据库、设置）存储在系统应用数据目录中：
   - macOS: `~/Library/Application Support/com.shiguang.ai-coding/`
   - Windows: `%APPDATA%/com.shiguang.ai-coding/`
   - Linux: `~/.local/share/com.shiguang.ai-coding/`

## 开源协议

MIT License

Copyright (c) 2025 ShiGuang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 创建 Pull Request
