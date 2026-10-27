# AI Coding Workbench — 功能清单与状态

> 创建时间：2026-02-26；状态核对：2026-10-27（master `6ef4f4c`）。
> 当前工作流为终端 OMP / Pi + Git 面板 + 文件编辑。下列状态以代码为准，README 为用户视角说明。

---

## 1. AI 生成 Commit Message — ✅ 已实现（部分）

**涉及：** `right-panel/GitActions.tsx`、`stores/gitStore.ts`、`commands/provider_commands.rs::generate_commit_message`

**已有：**
- GitActions 的「AI 生成」按钮读取暂存 diff，交给所选 OMP / Pi 以打印模式生成（`--print --no-session --no-tools --no-extensions`），prompt + diff 经 stdin 传入，60 秒期限，只返回文字、不创建提交
- 生成结果填入提交输入框，可编辑后提交

**未做：**
- 跟随界面语言生成中/英文说明（目前固定英文）

---

## 2. Git 分支切换/创建 — ✅ 已实现

**涉及：** `right-panel/GitOverview.tsx` + `BranchSelector.tsx`、`gitStore`、`commands/git_commands.rs`

**已有：** `git_list_branches` / `git_checkout_branch` / `git_create_branch` / `git_delete_branch`；点击分支名展开 BranchSelector，支持切换、基于 HEAD 新建、删除（带确认）。

**说明：** `checkout_branch` 在工作树有已跟踪改动时直接拒绝（"Cannot switch branch: uncommitted changes exist"），不自动 stash；未跟踪文件不算脏。

---

## 3. Hunk 级暂存（Chunk-level Stage/Unstage） — ❌ 未实现

**优先级：** 中
**涉及：** `right-panel/GitDiffView.tsx` + `git/mod.rs` + `commands/git_commands.rs`

**现状：** 只能整文件 stage/unstage（`git_stage_file` / `git_unstage_file`），没有 hunk 级命令。

**目标：**
- diff 视图中每个 `@@ ... @@` hunk 旁显示 stage/unstage 按钮
- 只暂存/取消暂存该 hunk，而非整个文件

**实现思路：**
- 后端新增 `git_stage_hunk` / `git_unstage_hunk`：用 libgit2 `apply` 将单个 hunk 的 patch 应用到 index（或走 `git apply --cached`，但需遵守"缺少 Git 命令行不阻断本地操作"的约定，优先 libgit2）
- 前端 GitDiffView 解析 hunk 边界，在 hunk header 行加操作按钮；注意 `MAX_DIFF_LINES = 3000` 截断后的 hunk 不能操作

---

## 4. 文件编辑能力 — ✅ 已实现

**涉及：** `center-panel/FileViewer.tsx`、`stores/fileStore.ts`、`commands/project_commands.rs::write_file_content`

**已有：** CodeMirror 6 编辑器，Cmd/Ctrl+S 保存；按不可变 `Text` 快照 + `doc.eq` 判断 dirty，保存保留撤销栈；≥ 5 MiB 字符进入轻量模式；保存成功后立即 `refreshRepo(root, false)`，文件出现在 Git 变更列表；文件树对未保存文件显示独立圆点。

---

## 已知未完成的内部改进（来自历史记录）

- 整体 Git diff 按需加载（当前 `git_diff` / `git_diff_staged` 一次返回，`MAX_DIFF_BYTES = 512 KB` 截断）
- 文件搜索取消（`search_in_files` 无取消信号）
- Windows 实机 / Windows CI 回归（旧版 ConPTY 关闭、真实 UNC 共享）
- Vite 构建提示：CodeMirror 静态/动态导入混用、主分包 > 500 kB

---

## 保留但未挂载的代码（处理前先决定去留）

- 聊天 UI：`MessageList` / `MessageItem` / `Composer` / `ProviderModelModeBar` / `ContextInjectBar` / `common/SearchResults`，以及 `chatStore`、`sessionStore`、`hooks/useKeyboardShortcuts.ts`
- `right-panel/RepoSection.tsx`（无引用）
- 后端 `send_message` / `stop_streaming` / `test_api_key`、`providers/*`、`search_messages`
- DB：`templates` 表、`sessions.tags_json`、`threads.source_thread_id` / `handoff_meta_json`、`messages_fts`

---

## 暂不需要的功能（记录备查）

以下功能与当前 CLI 为主的使用方式关系不大，后续如果重新挂载 AI 对话面板再考虑：

- 消息重试/重新生成
- 消息右键菜单（复制、引用到输入框）
- 消息搜索 UI
- Provider 切换自动创建新 Thread（Handoff）
- Prompt 模板库
- 代码块增强（语言标签、行号、应用到文件）
- Token/字符数估算
- 对话导出
- 快捷键体系
