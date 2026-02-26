# AI Coding Workbench — 待开发功能清单

> 基于当前使用场景（终端 Claude CLI + Git 面板 + 文件浏览）筛选出的高价值功能。
> 创建时间：2026-02-26

---

## 1. AI 生成 Commit Message

**优先级：** 高
**涉及：** Git Actions 组件 + 后端 AI 调用

**现状：** Git 面板有 commit 输入框，但需要手动写提交信息。

**目标：**
- 在 commit 输入框旁加一个"AI 生成"按钮
- 点击后读取当前 staged diff，调用 AI 自动生成 commit message
- 支持中英文生成（跟随当前语言设置）
- 生成后填入输入框，用户可编辑后再提交

**实现思路：**
- 后端新增 IPC 命令：传入 diff 文本，调用当前配置的 AI Provider 生成简短 commit message
- 前端：GitActions 组件加按钮，调用后填充 commitMessage

---

## 2. Git 分支切换/创建

**优先级：** 高
**涉及：** GitOverview 组件 + gitStore + 后端 Git 命令

**现状：** 只展示当前分支名和 ahead/behind 信息，不能切换或创建分支。

**目标：**
- 点击分支名展开分支列表（本地 + 远程）
- 支持切换到已有分支
- 支持创建新分支（基于当前 HEAD）
- 切换前检查是否有未提交更改，给出警告

**实现思路：**
- 后端新增 IPC 命令：`git_list_branches`、`git_checkout_branch`、`git_create_branch`
- 前端：GitOverview 中分支名改为可点击下拉，列出分支供选择

---

## 3. Hunk 级暂存（Chunk-level Stage/Unstage）

**优先级：** 中
**涉及：** GitDiffView 组件 + 后端 Git 命令

**现状：** 只能整文件 stage/unstage，无法按代码块（hunk）操作。

**目标：**
- 在文件 diff 视图中，每个 hunk（@@...@@块）旁边显示 stage/unstage 按钮
- 点击后只暂存/取消暂存该 hunk，而非整个文件
- 对于大文件多处修改只想提交部分的场景非常实用

**实现思路：**
- 后端新增 IPC 命令：`git_stage_hunk`（使用 `git apply --cached` 实现）
- 前端：GitDiffView 解析 hunk 边界，每个 hunk header 行旁加操作按钮

---

## 4. 文件编辑能力

**优先级：** 中
**涉及：** FileViewer 组件改造 → FileEditor

**现状：** FileViewer 是只读的代码查看器，修改文件需要打开外部编辑器。

**目标：**
- 将 FileViewer 升级为可编辑（或新增编辑模式切换）
- 支持基本文本编辑 + 保存（Cmd+S）
- 编辑后文件自动出现在 Git 变更列表中
- 不追求 VS Code 级别，够用即可

**实现思路：**
- 考虑集成轻量代码编辑器（如 CodeMirror 6 或 Monaco Editor 的精简版）
- 后端新增 IPC 命令：`write_file_content`（写入文件内容）
- 保存后触发 Git 状态刷新

---

## 暂不需要的功能（记录备查）

以下功能与当前 CLI 为主的使用方式关系不大，后续如果更多使用 AI 对话面板再考虑：

- 消息重试/重新生成
- 消息右键菜单（复制、引用到输入框）
- 消息搜索 UI
- Provider 切换自动创建新 Thread（Handoff）
- Prompt 模板库
- 代码块增强（语言标签、行号、应用到文件）
- Token/字符数估算
- 对话导出
- 快捷键体系
