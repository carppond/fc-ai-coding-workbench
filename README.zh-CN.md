[English](README.md) | 中文

# 拾光 AI 编程平台

一款集成 AI 对话、Git 工作流和终端的桌面编程辅助工具，基于 Tauri 2 构建，支持 macOS、Windows 和 Linux。

## 功能特性

- **AI 对话（开发中）** — 保留 Anthropic Claude、OpenAI 服务商接口；终端 AI 编程使用 OMP 或 Pi
- **Git 集成** — 文件级暂存/撤销、提交、推送/拉取、分支追踪、提交日志、差异预览
- **内置终端** — 多 Tab 终端，支持 zsh/bash/fish/PowerShell、自定义 prompt 和快捷键；通过有界流控保持隐藏标签中的 ANSI 输出顺序
- **文件管理** — 项目文件树浏览、搜索、新建/重命名/删除
- **文件编辑** — CodeMirror 编辑器按文档快照判断保存状态，保留撤销历史；大文件使用轻量模式，仍支持编辑、搜索、撤销和保存
- **环境检测** — 本地工具检测与后台更新检查分离，共享检测请求，并为子进程设置执行期限
- **网络代理** — 支持 HTTP/HTTPS/SOCKS5 代理，一键应用到 Git、npm、终端及 API 请求
- **编程 CLI 会话** — 默认 OMP、记住 CLI 选择，提供新会话／继续上次／选择会话三个动作，按 CLI 能力展示审批设置
- **多主题** — 内置 14 款主题（Catppuccin Mocha/Latte、Dracula、Nord、Tokyo Night 等）
- **双语界面** — 中文 / English 一键切换
- **安全存储** — 应用内服务商 API 密钥仍使用系统钥匙串；OMP、Pi 各自管理登录和模型配置

## 编程 CLI 工作流

- 在终端工具栏或设置中选择 OMP／Pi，选择会持久保存，与 AI 服务商和模型设置相互独立；Claude 模型仍可使用。
- 三个动作沿用当前终端窗格的工作目录。终端忙碌或无法确认就绪时拒绝启动，不向运行中的 TUI 注入命令。
- **新会话**始终新建。OMP 本次启动会读取仅含 `autoResume: false` 的临时配置，避免全局自动续接改变按钮语义，不改写用户配置。
- **继续上次**使用 `--continue`；**选择会话**打开各 CLI 自带的 `--resume` 选择器。两款 CLI 分别管理自己的历史。
- OMP 提供“跟随配置”“逐次确认”“自动批准全部工具”；最后一项包含命令执行，需要明确确认。Pi 不显示同名审批开关，其 `--approve` 是项目信任，不是逐工具审批。
- Git 提交说明由所选 CLI 以不保存会话、禁用工具的打印模式生成，仅返回文字，不执行 `omp commit` 或创建提交。
- 已有 Claude Code 文件、shell 配置、密钥和历史均保留；应用不再提供旧的恢复命令捕获钩子和命令安装器。

## 截图

以下图片展示较早版本界面，当前 CLI 入口以上述说明为准。

| 主界面 | Memory Guide 引导 | 设置页面 |
|:-:|:-:|:-:|
| ![主界面](screenshot/screenshot01.jpg) | ![Memory Guide 引导](screenshot/screenshot02.jpg) | ![设置页面](screenshot/screenshot03.jpg) |

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
- **编程 CLI 运行时** — OMP 原生二进制无需 Node.js 或 Bun；Bun 安装渠道需要 Bun >= 1.3.14。Pi 的 npm 包需要 Node.js >= 22.19.0 和 npm。

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

1. **API 密钥安全** — 应用内服务商密钥仍存储在系统钥匙串。OMP／Pi 自行管理登录和模型设置，应用不复制密钥或写入 shell API 环境变量。
2. **代理设置** — 设置面板中的代理配置会持久化到数据库，重启应用后自动恢复
3. **终端环境** — 内置终端会继承系统 shell 环境并自定义 prompt，如需恢复原始 prompt 可删除对应临时文件
4. **Git 操作** — 为避免误操作，暂存时会自动过滤 `node_modules`、`.git`、`target` 等目录
5. **数据存储** — 应用数据（数据库、设置）存储在系统应用数据目录中：
   - macOS: `~/Library/Application Support/com.shiguang.ai-coding/`
   - Windows: `%APPDATA%/com.shiguang.ai-coding/`
   - Linux: `~/.local/share/com.shiguang.ai-coding/`

## 开源协议

[MIT License](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 创建 Pull Request
