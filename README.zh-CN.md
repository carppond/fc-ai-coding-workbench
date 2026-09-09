[English](README.md) | 中文

# 拾光 AI 编程平台

一款集成 Git 工作流、终端和 AI 服务商接口的桌面 AI 编程工作台，基于 Tauri 2 构建，支持 macOS、Windows 和 Linux。可使用 OMP、Pi 等编程客户端，按所选 CLI 的服务商与账户配置选择 Claude、GPT 等模型。

## 功能特性

- **AI 对话（开发中）** — 保留 Anthropic／Claude、OpenAI／GPT 服务商接口，与终端 CLI 的登录及模型配置相互独立
- **Git 集成** — 文件级暂存/撤销、提交、推送/拉取、分支追踪、提交日志、差异预览
- **内置终端** — 多 Tab 终端，支持 zsh/bash/fish/PowerShell、自定义 prompt 和快捷键；通过有界流控保持隐藏标签中的 ANSI 输出顺序
- **文件管理** — 项目文件树浏览、搜索、新建/重命名/删除；按仓库显示 Git 改动标记，未保存的编辑单独显示圆点
- **文件编辑** — CodeMirror 编辑器按文档快照判断保存状态，保留撤销历史；大文件使用轻量模式，仍支持编辑、搜索、撤销和保存
- **按需环境配置** — 启动直接进入工作台，需要时检查／安装相关工具；本地检测与后台更新检查分离，共享请求，并为子进程设置执行期限
- **网络代理** — 支持 HTTP/HTTPS/SOCKS5 代理，一键应用到 Git、npm、终端及 API 请求
- **编程 CLI 会话** — 默认 OMP、记住 CLI 选择，提供新会话／继续上次／选择会话三个动作，按 CLI 能力展示审批设置
- **多主题** — 内置 Catppuccin Mocha/Latte、Dracula、Nord、Tokyo Night 等主题，可从顶栏切换
- **双语界面** — 中文 / English 一键切换
- **安全存储** — 应用内服务商 API 密钥仍使用系统钥匙串；OMP、Pi 各自管理登录和模型配置

## 进入工作台

- 启动保留轻量加载占位，随后直接进入工作台，不再经过设置向导，也不依赖引导完成标记。
- 未打开项目时，通过 **打开项目** 选择文件夹；也可以先使用终端。首次打开项目后，终端会进入该项目目录。
- 当前 CLI 不可用时，终端操作旁提供 **检查／安装 OMP／Pi**。弹层只显示该 CLI 及其安装依赖：OMP 原生安装无需 Node.js、npm 或 Bun，Pi 的 npm 渠道需要 Node.js／npm。
- 拉取／推送、AI 提交说明生成只检查各自需要的工具。缺少 Git 命令行不会阻断基于 libgit2 的本地操作，“仅提交”与“提交并推送”分别处理。
- 设置中仍保留完整环境管理；已有服务商／模型、CLI 选择、审批策略、主题字号、凭据与历史保持不变。

## 编程 CLI 工作流

- 在终端工具栏或设置中选择 OMP／Pi。它们是编程客户端，不是模型；在所选 CLI 中配置 Claude、GPT 或其他受支持模型，其登录／模型配置与应用内 AI 服务商和模型设置相互独立。
- 三个动作沿用当前终端窗格的工作目录。终端忙碌或无法确认就绪时拒绝启动，不向运行中的 TUI 注入命令。
- **新会话**始终新建。OMP 本次启动会读取仅含 `autoResume: false` 的临时配置，避免全局自动续接改变按钮语义，不改写用户配置。
- **继续上次**使用 `--continue`；**选择会话**打开各 CLI 自带的 `--resume` 选择器。两款 CLI 分别管理自己的历史。
- OMP 提供“跟随配置”“逐次确认”“自动批准全部工具”；最后一项包含命令执行，需要明确确认。Pi 不显示同名审批开关，其 `--approve` 是项目信任，不是逐工具审批。
- Git 提交说明由所选 CLI 以不保存会话、禁用工具的打印模式生成，仅返回文字，不执行 `omp commit` 或创建提交。
- 已有编程客户端文件、shell 配置、凭据和历史均保留；切换客户端不会转换或删除其他客户端的配置与历史。

### Windows 终端与路径

- 优先使用 PowerShell 7，其次为 Windows PowerShell，最后回退到 CMD。探测 shell 时不执行配置文件；交互式 PowerShell 按标准机制加载配置一次，使用 UTF-8 输入／输出。应用不修改执行策略。
- Windows／Linux 终端使用 **Ctrl+Shift+F/K/W** 搜索、清屏、关闭，**Ctrl+Shift+C/V** 复制／粘贴；仍支持 Ctrl+V 和右键粘贴。Ctrl+W/F/P 留给 CLI 的编辑／模型快捷键，无选区时 Ctrl+C 中断程序。macOS 保留 Command 快捷键；文件编辑器仍使用 Ctrl+W 关闭。
- 多行粘贴跟随前台程序的括号粘贴模式，包括 PowerShell 中运行的 CLI，不再根据父 shell 名称猜测。
- Windows 盘符、UNC 和 `\\?\` 路径在打开／保存文件时保留原始写法，仅在项目与 Git 归属比较时统一大小写和分隔符。CMD 使用 `cd /d` 切换盘符，UNC 共享使用 `pushd`；无法安全引用的 CMD 路径会被拒绝，请改用 PowerShell。
- 工具检测与终端 PATH 包含 OMP／npm／Bun、Node.js、Git 和 PowerShell 的常见安装目录。修改自定义 PATH 目录后请重启应用。
- 应用内 API 密钥使用 **Windows 凭据管理器**。旧 Windows 版本若出现保存后丢失密钥的情况，请在更新后重新保存一次；OMP／Pi 自身的登录不受影响。

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
| 密钥存储 | keyring (macOS Keychain / Windows 凭据管理器 / Linux Secret Service) |

## 环境要求

- **Node.js** >= 18
- **Rust** — 当前稳定版工具链
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

各平台打包前执行 `npm run test:file-tree` 和 `cargo test --locked`。Windows 专用测试覆盖 shell／脚本执行、目录字面路径切换和凭据持久化；在 macOS／Linux 上运行测试不会执行这些 Windows 用例。旧版 Windows 的 ConPTY 关闭、真实 UNC 共享访问仍需 Windows 运行环境验证。

构建产物：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` (Universal Binary) |
| Windows | `.exe` (NSIS) |
| Linux | `.deb` + `.AppImage` |

## 注意事项

1. **API 密钥安全** — 应用内服务商密钥仍存储在系统钥匙串。OMP／Pi 自行管理登录和模型设置，应用不复制密钥或写入 shell API 环境变量。
2. **代理设置** — 设置面板中的代理配置会持久化到数据库，重启应用后自动恢复
3. **终端环境** — 终端继承进程环境，仅为当前会话自定义 prompt，不改写用户 shell 配置文件。
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
