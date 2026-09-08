import { create } from "zustand";
import * as ipc from "../ipc/commands";

export type Locale = "zh" | "en";

interface I18nState {
  locale: Locale;
  t: (key: string) => string;
  toggleLocale: () => void;
  loadLocale: () => Promise<void>;
}

const translations: Record<Locale, Record<string, string>> = {
  zh: {
    // TopBar
    "topbar.title": "拾光 AI 编程平台",
    "topbar.openProject": "打开项目...",
    "topbar.searchPlaceholder": "搜索消息... (Cmd+K)",

    // LeftPanel
    "leftPanel.sessions": "会话",
    "leftPanel.newSession": "新建会话",
    "leftPanel.addSession": "+ 会话",
    "leftPanel.addThread": "+ 对话",
    "leftPanel.noProjectOpen": "未打开项目",
    "leftPanel.openProjectToStart": "打开一个项目文件夹以开始",
    "leftPanel.clickSessionToBegin": "点击 \"+ 会话\" 开始",
    "leftPanel.files": "文件",
    "leftPanel.search": "搜索",

    // FileTree
    "fileTree.emptyDir": "目录为空",
    "fileTree.refresh": "刷新文件树",
    "fileTree.newFile": "新建文件",
    "fileTree.newFolder": "新建文件夹",
    "fileTree.rename": "重命名",
    "fileTree.delete": "删除",
    "fileTree.deleteConfirm": "确定删除 \"{name}\"？此操作不可恢复。",
    "fileTree.showInFolder": "在文件管理器中显示",

    // CenterPanel / Terminal
    "centerPanel.noThreadSelected": "未选择对话",
    "centerPanel.createOrSelect": "创建一个会话和对话，或选择已有的",
    "centerPanel.terminal": "终端",
    "centerPanel.chat": "聊天",
    "centerPanel.file": "文件",
    "terminal.exited": "终端进程已退出",
    "terminal.restart": "重启终端",
    "terminal.newTab": "新建终端",
    "terminal.rename": "重命名",
    "terminal.splitRight": "向右拆分",
    "terminal.splitDown": "向下拆分",
    "terminal.closePane": "关闭",
    "terminal.chooseDir": "选择目录新建...",
    "terminal.newTerminal": "新建终端",
    "terminal.tooltipNew": "新建终端 (右键选择目录)",
    "terminal.tooltipRename": "双击重命名",

    // Composer
    "composer.placeholder": "输入消息...",
    "composer.placeholderFull": "输入消息... (Enter 发送, Shift+Enter 换行)",
    "composer.noThread": "选择或创建对话以开始聊天",
    "composer.chars": "字符",

    // ContextInjectBar
    "context.diff": "差异",
    "context.staged": "暂存",
    "context.file": "文件",
    "context.tree": "目录",

    // RightPanel / Git
    "git.title": "源代码管理",
    "git.openProjectToSee": "打开项目以查看源代码管理",
    "git.notARepo": "不是 Git 仓库",
    "git.workingTreeClean": "工作树干净",
    "git.staged": "暂存",
    "git.changes": "更改",
    "git.stage": "暂存",
    "git.unstage": "取消暂存",
    "git.stageAll": "暂存全部",
    "git.unstageAll": "取消暂存全部",
    "git.commitMessage": "提交消息...",
    "git.commit": "提交",
    "git.pull": "拉取",
    "git.push": "推送",
    "git.workdir": "工作区",
    "git.noDiff": "无差异可显示",
    "git.toAI": "发给 AI",
    "git.ahead": "领先",
    "git.behind": "落后",
    "git.log": "提交日志",
    "git.noCommits": "暂无提交记录",
    "git.initHint": "当前项目不是 Git 仓库",
    "git.commitConfirm": "选择提交方式",
    "git.commitOnly": "仅提交",
    "git.commitAndPush": "提交并推送",
    "git.commitSuccess": "提交成功",
    "git.pullSuccess": "拉取成功",
    "git.pushSuccess": "推送成功",
    "git.discard": "撤销更改",
    "git.discardConfirm": "确定撤销此文件的更改？此操作不可恢复。",
    "git.showMore": "显示更多 ({count} 个文件未显示)",
    "git.showLess": "收起",
    "git.pullConfirm": "确定从远程拉取？",
    "git.pushConfirm": "确定推送到远程？",
    "git.pullConfirmDirty": "当前有未提交的更改，拉取可能导致冲突。\n\n建议先提交更改后再拉取。确定继续？",
    "git.pushConfirmDirty": "当前有未提交的更改，这些更改不会被推送。\n\n确定继续推送已提交的内容？",
    "git.copyDiff": "复制差异",
    "git.copied": "已复制",
    "git.filesChanged": "个文件更改",
    "git.initButton": "初始化 Git 仓库",
    "git.remoteUrlPlaceholder": "远程仓库 URL (可选)",
    "git.remoteUrlHint": "例如: https://github.com/user/repo.git",
    "git.initSkipRemote": "跳过，仅初始化",
    "git.initSuccess": "Git 仓库初始化成功",
    "git.initRemoteWarning": "如果远程仓库已有提交历史，直接推送可能会失败",
    "git.invalidUrl": "请输入有效的 Git 远程 URL",
    "git.truncated": "{count}+ 个文件 — 列表已截断",
    "git.generateCommit": "AI 生成",
    "git.noStagedForAI": "没有暂存的更改",
    "git.generating": "正在生成...",
    "git.branches": "分支",
    "git.localBranches": "本地分支",
    "git.remoteBranches": "远程分支",
    "git.newBranchPlaceholder": "新建分支名称...",
    "git.createBranch": "创建",
    "git.deleteBranch": "删除分支",
    "git.deleteBranchConfirm": "确定删除分支 \"{name}\"？",
    "git.forceDelete": "强制删除",
    "git.branchNotMerged": "分支未合并，需要强制删除",
    "git.switchBranch": "切换分支",
    "git.currentBranch": "当前分支",
    "git.branchCreated": "分支已创建",
    "git.branchDeleted": "分支已删除",
    "git.branchSwitched": "已切换到分支",
    "git.searchBranches": "搜索分支...",
    "git.notGitRepo": "非 Git 仓库",
    "git.conflicted": "冲突",
    "git.resolveOurs": "本地",
    "git.resolveTheirs": "远程",
    "git.resolveEdit": "编辑",
    "git.mergeAbort": "中止合并",
    "git.mergeAbortConfirm": "确定中止合并？所有冲突解决的进度将丢失。",
    "git.mergeAbortSuccess": "已中止合并",
    "git.conflictWarning": "有 {count} 个文件冲突，请先解决",

    // Project multi-select
    "project.deselect": "取消选中",

    // TopBar - Theme
    "topbar.switchTheme": "切换主题",
    "topbar.ipCheck": "IP 检测",

    // SetupWizard
    "wizard.welcome": "欢迎使用拾光 AI 编程平台",
    "wizard.welcomeSubtitle": "一个集成 Git 的 AI 编程辅助桌面平台。让我们来设置您的环境。",
    "wizard.skipSetup": "跳过设置",
    "wizard.getStarted": "开始设置",
    "wizard.back": "上一步",
    "wizard.next": "下一步",
    "wizard.skip": "跳过",
    "wizard.finishSetup": "完成设置",
    "wizard.themeTitle": "选择主题",
    "wizard.themeSubtitle": "选择您喜欢的界面主题，随时可在顶栏切换。",
    "wizard.openProject": "打开项目",
    "wizard.openProjectSubtitle": "选择一个项目文件夹以开始。您也可以稍后再做。",
    "wizard.chooseProjectFolder": "选择项目文件夹...",
    "wizard.projectSelected": "已选择项目",

    // Environment Setup
    "wizard.environment": "环境检测 & 安装",
    "wizard.environmentSubtitle": "确保开发环境就绪，检测并安装所需工具。",
    "env.installMethod": "安装方式",
    "env.update": "更新",
    "env.installing": "安装中...",
    "env.installSuccess": "安装成功！",
    "env.installError": "安装失败",
    "env.openNodejsOrg": "前往 nodejs.org 下载",
    "env.installViaBrew": "通过 brew 安装",
    "env.detecting": "正在检测开发环境...",
    "env.detectRefresh": "重新检测",
    "env.checkingUpdate": "正在后台检查更新...",
    "env.updateCheckFailed": "暂时无法检查更新，本地环境检测已完成",
    "env.installedVia": "安装方式:",
    "env.needNodeFirst": "需要先安装 Node.js",
    "env.installXcodeTools": "安装 Xcode 命令行工具",
    "env.openGitScm": "前往 git-scm.com 下载",

    // Settings panel
    "settings.title": "设置",
    "settings.close": "关闭",
    "settings.environment": "环境管理",
    "settings.apiKeys": "API 密钥",
    "settings.setAsActive": "设为活跃",
    "settings.del": "删除",

    // Proxy
    "settings.proxy": "网络代理",
    "proxy.url": "代理地址",
    "proxy.urlPlaceholder": "http://127.0.0.1:7890",
    "proxy.save": "保存",
    "proxy.clear": "清除",
    "proxy.saved": "代理已保存",
    "proxy.cleared": "代理已清除",
    "proxy.enabled": "已启用",
    "proxy.disabled": "未启用",
    "proxy.hint": "代理将应用于 Git、npm、终端及 API 请求。支持 HTTP/HTTPS/SOCKS5。",


    // SessionItem
    "session.deleteSession": "删除会话",
    "session.deleteConfirm": "删除 \"{title}\" 及其所有对话？",

    // ConfirmDialog
    "confirm.cancel": "取消",
    "confirm.ok": "确定",
    "confirm.delete": "删除",

    // SearchResults
    "search.noResults": "未找到结果",

    // MessageItem
    "message.user": "用户",
    "message.assistant": "助手",

    // MessageList
    "message.thinking": "思考中...",

    // ProviderModelModeBar
    "thread.nameTemplate": "{provider} 对话",

    // File Search
    "fileSearch.placeholder": "在文件中搜索...",
    "fileSearch.noResults": "未找到匹配",
    "fileSearch.results": "个匹配",

    // File Viewer / Editor
    "fileViewer.close": "关闭文件",
    "fileViewer.tooLarge": "文件过大，仅显示前 {lines} 行",
    "fileViewer.line": "行",
    "fileViewer.save": "保存 (Cmd+S)",
    "fileViewer.saved": "已保存",
    "fileViewer.largeFileMode": "大文件模式",
    "fileViewer.largeFileModeHint": "关闭语法分析与补全，仍可编辑、搜索和保存",
    "fileViewer.unsavedChanges": "文件有未保存的更改，确定关闭？",
    "fileViewer.dontSave": "不保存",
    "fileViewer.preview": "预览",
    "fileViewer.edit": "编辑",

    // Quick Open
    "quickOpen.placeholder": "输入文件名搜索... (Cmd+P)",
    "quickOpen.noResults": "未找到匹配文件",

    // Git Stash
    "git.stash": "贮藏",
    "git.stashSave": "贮藏",
    "git.stashApply": "应用",
    "git.stashDrop": "删除",
    "git.stashSaved": "更改已贮藏",
    "git.stashApplied": "贮藏已应用",
    "git.stashDropped": "贮藏已删除",
    "git.stashDropConfirm": "确定删除此贮藏条目？此操作不可恢复。",
    "git.stashNothingToSave": "没有可贮藏的更改",

    // Git Tag
    "git.tags": "标签",
    "git.createTag": "创建标签",
    "git.deleteTag": "删除标签",
    "git.pushTag": "推送标签",
    "git.tagName": "标签名称",
    "git.tagMessage": "标签消息（可选）",
    "git.annotatedTag": "注解标签",
    "git.tagCreated": "标签已创建",
    "git.tagDeleted": "标签已删除",
    "git.tagPushed": "标签已推送",
    "git.deleteTagConfirm": "确定删除标签 \"{name}\"？此操作不可恢复。",
    "git.noTags": "暂无标签",

    // Font Size
    "fontSize.title": "字体大小",
    "fontSize.editor": "编辑器",
    "fontSize.terminal": "终端",
    "fontSize.chat": "聊天",
    "terminal.settings": "终端设置",
    "terminal.scrollback": "回滚行数",
    "terminal.lines": "行",
    "terminal.lineHeight": "行高",
    "terminal.renderer": "渲染器",
    "terminal.rendererDom": "DOM（最稳定）",
    "terminal.rendererWebgl": "WebGL（高性能）",

    // Shortcuts Reference
    "shortcuts.title": "快捷键",
    "shortcuts.global": "全局",
    "shortcuts.editor": "编辑器",
    "shortcuts.terminal": "终端",
    "shortcuts.chat": "聊天",
    "shortcuts.git": "Git",
    "shortcuts.quickOpen": "快速打开文件",
    "shortcuts.newSession": "新建会话",
    "shortcuts.send": "发送消息",
    "shortcuts.focusSearch": "聚焦搜索",
    "shortcuts.close": "关闭/取消",
    "shortcuts.save": "保存文件",
    "shortcuts.indent": "缩进",
    "shortcuts.undo": "撤销",
    "shortcuts.redo": "重做",
    "shortcuts.find": "查找",
    "shortcuts.termSearch": "搜索终端",
    "shortcuts.termClear": "清除终端",
    "shortcuts.termCopy": "复制选中/中断",
    "shortcuts.termPaste": "粘贴",
    "shortcuts.termNewline": "输入换行",
    "shortcuts.chatSend": "发送消息",
    "shortcuts.chatNewline": "输入换行",
    "shortcuts.closePane": "关闭当前面板",
    "shortcuts.gitCommit": "提交",


    // Loading
    "loading": "加载中...",


    // Coding CLIs
    "cli.settingsTitle": "编程 CLI",
    "cli.setupTitle": "选择编程 CLI",
    "cli.setupSubtitle": "OMP / Pi 复用各自已有的登录和模型配置，仍支持 Anthropic / Claude 模型。",
    "cli.setupPreservation": "本应用不会复制密钥或写入 shell API 环境变量，也不会改写现有 CLI 配置与历史。应用内 AI 聊天的服务商配置独立保留。",
    "cli.guide.title": "CLI 与项目规则指南",
    "cli.guide.sessions": "会话启动与恢复",
    "cli.guide.selected": "当前选择：{cli}。可在设置或终端工具栏切换；选择会保存。",
    "cli.guide.projectDirectory": "在项目目录的终端中运行以下命令，或使用终端工具栏对应的会话动作。",
    "cli.guide.new": "新建会话",
    "cli.guide.newHint": "工具栏“新会话”始终新建；手动执行下方普通启动命令时，仍遵循 CLI 自身的自动恢复配置。",
    "cli.guide.continue": "继续最近会话",
    "cli.guide.continueHint": "继续当前 CLI 在当前项目目录下最近保存的会话。",
    "cli.guide.resume": "选择历史会话",
    "cli.guide.resumeHint": "打开当前 CLI 的会话选择器，再选择要恢复的会话。",
    "cli.guide.separateSessions": "OMP 和 Pi 分别管理自己的会话；切换 CLI 不会转换或删除历史。已有 Claude Code 配置和历史也不会被清理。",
    "cli.guide.models": "登录与模型",
    "cli.guide.modelCommands": "在 CLI 内使用 /login 登录受支持的服务商，使用 /model 选择模型。已有凭据可继续按该 CLI 的配置方式使用。",
    "cli.guide.rules": "项目规则与持久知识",
    "cli.guide.rulesHint": "在项目根目录维护 AGENTS.md，可让工具按各自的上下文加载规则读取项目约定。先检查团队已有规则，再决定是否需要编辑。",
    "cli.guide.rulesContent": "适合记录项目结构、构建与测试命令、编码规范和限制；不要把密钥写入规则文件。",
    "cli.guide.rulesCompatibility": "已有 CLAUDE.md 可以按当前 CLI 的兼容加载规则继续使用，不必为了切换 CLI 重写。此指南不会创建或修改任何规则文件。",
    "cli.guide.memoryScope": "会话历史、项目规则和 CLI 的记忆功能不是同一回事。说“记住”不保证跨会话持久保存；重要约定应明确保存到项目规则中，具体记忆能力以所选 CLI 的配置为准。",
    "cli.guide.approval": "工具审批",
    "cli.guide.ompApproval": "OMP 支持默认策略、始终询问（--approval-mode=always-ask）和自动批准（--auto-approve）。工具栏启动会应用已保存的策略；自动批准会减少人工确认，仅在可信项目中使用。",
    "cli.guide.piApproval": "Pi 不提供对应的工具审批启动参数，因此只使用默认策略。--approve 控制项目信任，不代表工具执行审批，本应用不会用它替代审批设置。",
    "cli.selection": "编程 CLI",
    "cli.approval": "工具审批",
    "cli.approvalDefault": "跟随配置",
    "cli.approvalAlwaysAsk": "逐次确认",
    "cli.approvalAutoApprove": "自动批准全部工具",
    "cli.autoApproveTitle": "自动批准全部工具？",
    "cli.autoApproveWarning": "OMP 将自动批准所有工具操作，包括执行命令、读写文件等，不再逐次询问。这可能修改或删除项目文件，也可能执行有风险的命令。仅在信任当前项目和任务时启用。",
    "cli.autoApproveConfirm": "启用自动批准",
    "cli.saveFailed": "CLI 设置保存失败",
    "cli.ompApprovalHint": "下次启动 CLI 时生效。「跟随配置」保留 OMP 自身的审批策略。",
    "cli.piTrustHint": "Pi 默认直接执行工具。项目资源信任决定是否加载项目配置和扩展，并非逐次工具审批；本应用不会向 Pi 传递 --approve。",
    "cli.installNative": "原生安装",
    "cli.installBun": "Bun",
    "cli.installBrew": "Homebrew",
    "cli.ompNativeHint": "OMP 原生安装无需 Node.js 或 Bun。",
    "cli.bunRuntimeRequired": "Bun 渠道需要 Bun ≥1.3.14。",
    "cli.piRuntimeRequired": "Pi 的 npm 安装需要 Node.js ≥22.19.0 且 npm 可用。",
    "cli.install": "安装",
    "cli.openBun": "前往 bun.sh 安装",
    "cli.unknownError": "未知错误",
    "cli.continue": "继续上次",
    "cli.resume": "选择会话",
    "cli.newSession": "新会话",
    "cli.launchFailed": "{cli} 启动失败",
    "cli.notInstalled": "{cli} 不可用，请在环境管理中安装或刷新检测",
    "cli.sessionActions": "编程 CLI 会话操作",

    // Language toggle
    "locale.toggle": "中/EN",
  },
  en: {
    // TopBar
    "topbar.title": "ShiGuang AI Coding Platform",
    "topbar.openProject": "Open Project...",
    "topbar.searchPlaceholder": "Search messages... (Cmd+K)",

    // LeftPanel
    "leftPanel.sessions": "Sessions",
    "leftPanel.newSession": "New Session",
    "leftPanel.addSession": "+ Session",
    "leftPanel.addThread": "+ Thread",
    "leftPanel.noProjectOpen": "No Project Open",
    "leftPanel.openProjectToStart": "Open a project folder to start",
    "leftPanel.clickSessionToBegin": "Click \"+ Session\" to begin",
    "leftPanel.files": "Files",
    "leftPanel.search": "Search",

    // FileTree
    "fileTree.emptyDir": "Directory is empty",
    "fileTree.refresh": "Refresh file tree",
    "fileTree.newFile": "New File",
    "fileTree.newFolder": "New Folder",
    "fileTree.rename": "Rename",
    "fileTree.delete": "Delete",
    "fileTree.deleteConfirm": "Delete \"{name}\"? This cannot be undone.",
    "fileTree.showInFolder": "Show in Finder",

    // CenterPanel
    "centerPanel.noThreadSelected": "No Thread Selected",
    "centerPanel.createOrSelect": "Create a session and thread, or select an existing one",
    "centerPanel.file": "File",
    "centerPanel.terminal": "Terminal",
    "centerPanel.chat": "Chat",
    "terminal.exited": "Terminal process exited",
    "terminal.restart": "Restart Terminal",
    "terminal.newTab": "New Terminal",
    "terminal.rename": "Rename",
    "terminal.splitRight": "Split Right",
    "terminal.splitDown": "Split Down",
    "terminal.closePane": "Close",
    "terminal.chooseDir": "New Terminal in Directory...",
    "terminal.newTerminal": "New Terminal",
    "terminal.tooltipNew": "New Terminal (right-click for directory)",
    "terminal.tooltipRename": "Double-click to rename",

    // Composer
    "composer.placeholder": "Type your message...",
    "composer.placeholderFull": "Type your message... (Enter to send, Shift+Enter for newline)",
    "composer.noThread": "Select or create a thread to start chatting",
    "composer.chars": "chars",

    // ContextInjectBar
    "context.diff": "Diff",
    "context.staged": "Staged",
    "context.file": "File",
    "context.tree": "Tree",

    // RightPanel / Git
    "git.title": "Source Control",
    "git.openProjectToSee": "Open a project to see source control",
    "git.notARepo": "Not a git repository",
    "git.workingTreeClean": "Working tree clean",
    "git.staged": "Staged",
    "git.changes": "Changes",
    "git.stage": "Stage",
    "git.unstage": "Unstage",
    "git.stageAll": "Stage All",
    "git.unstageAll": "Unstage All",
    "git.commitMessage": "Commit message...",
    "git.commit": "Commit",
    "git.pull": "Pull",
    "git.push": "Push",
    "git.workdir": "Workdir",
    "git.noDiff": "No diff to show",
    "git.toAI": "To AI",
    "git.ahead": "ahead",
    "git.behind": "behind",
    "git.log": "Commit Log",
    "git.noCommits": "No commits yet",
    "git.initHint": "Current project is not a Git repository",
    "git.commitConfirm": "Choose commit action",
    "git.commitOnly": "Commit Only",
    "git.commitAndPush": "Commit & Push",
    "git.commitSuccess": "Committed successfully",
    "git.pullSuccess": "Pulled successfully",
    "git.pushSuccess": "Pushed successfully",
    "git.discard": "Discard Changes",
    "git.discardConfirm": "Discard changes to this file? This cannot be undone.",
    "git.showMore": "Show more ({count} files hidden)",
    "git.showLess": "Show less",
    "git.pullConfirm": "Pull from remote?",
    "git.pushConfirm": "Push to remote?",
    "git.pullConfirmDirty": "You have uncommitted changes. Pulling may cause conflicts.\n\nIt's recommended to commit first. Continue anyway?",
    "git.pushConfirmDirty": "You have uncommitted changes that won't be pushed.\n\nContinue pushing committed content only?",
    "git.copyDiff": "Copy Diff",
    "git.copied": "Copied",
    "git.filesChanged": "files changed",
    "git.initButton": "Initialize Git Repository",
    "git.remoteUrlPlaceholder": "Remote URL (optional)",
    "git.remoteUrlHint": "e.g. https://github.com/user/repo.git",
    "git.initSkipRemote": "Skip, init only",
    "git.initSuccess": "Git repository initialized",
    "git.initRemoteWarning": "If the remote has existing history, direct push may fail",
    "git.invalidUrl": "Please enter a valid Git remote URL",
    "git.truncated": "{count}+ files — list truncated",
    "git.generateCommit": "AI Generate",
    "git.noStagedForAI": "No staged changes",
    "git.generating": "Generating...",
    "git.branches": "Branches",
    "git.localBranches": "Local Branches",
    "git.remoteBranches": "Remote Branches",
    "git.newBranchPlaceholder": "New branch name...",
    "git.createBranch": "Create",
    "git.deleteBranch": "Delete Branch",
    "git.deleteBranchConfirm": "Delete branch \"{name}\"?",
    "git.forceDelete": "Force Delete",
    "git.branchNotMerged": "Branch is not merged, force delete required",
    "git.switchBranch": "Switch Branch",
    "git.currentBranch": "Current Branch",
    "git.branchCreated": "Branch created",
    "git.branchDeleted": "Branch deleted",
    "git.branchSwitched": "Switched to branch",
    "git.searchBranches": "Search branches...",
    "git.notGitRepo": "Not a Git repo",
    "git.conflicted": "Conflicts",
    "git.resolveOurs": "Ours",
    "git.resolveTheirs": "Theirs",
    "git.resolveEdit": "Edit",
    "git.mergeAbort": "Abort Merge",
    "git.mergeAbortConfirm": "Abort merge? All conflict resolution progress will be lost.",
    "git.mergeAbortSuccess": "Merge aborted",
    "git.conflictWarning": "{count} file(s) in conflict, resolve before committing",

    // Project multi-select
    "project.deselect": "Deselect",

    // TopBar - Theme
    "topbar.switchTheme": "Switch Theme",
    "topbar.ipCheck": "IP Check",

    // SetupWizard
    "wizard.welcome": "Welcome to ShiGuang AI Coding Platform",
    "wizard.welcomeSubtitle": "A desktop platform for AI-assisted coding with Git integration. Let's set up your environment.",
    "wizard.skipSetup": "Skip Setup",
    "wizard.getStarted": "Get Started",
    "wizard.back": "Back",
    "wizard.next": "Next",
    "wizard.skip": "Skip",
    "wizard.finishSetup": "Finish Setup",
    "wizard.themeTitle": "Choose Theme",
    "wizard.themeSubtitle": "Pick your preferred theme. You can switch anytime from the top bar.",
    "wizard.openProject": "Open a Project",
    "wizard.openProjectSubtitle": "Select a project folder to get started. You can also do this later.",
    "wizard.chooseProjectFolder": "Choose Project Folder...",
    "wizard.projectSelected": "Project selected",

    // Environment Setup
    "wizard.environment": "Environment Setup",
    "wizard.environmentSubtitle": "Ensure your development environment is ready.",
    "env.installMethod": "Install via",
    "env.update": "Update",
    "env.installing": "Installing...",
    "env.installSuccess": "Installed successfully!",
    "env.installError": "Installation failed",
    "env.openNodejsOrg": "Download from nodejs.org",
    "env.installViaBrew": "Install via brew",
    "env.detecting": "Detecting environment...",
    "env.detectRefresh": "Re-detect",
    "env.checkingUpdate": "Checking for updates in the background...",
    "env.updateCheckFailed": "Update check unavailable; local environment check is complete",
    "env.installedVia": "Installed via:",
    "env.needNodeFirst": "Node.js must be installed first",
    "env.installXcodeTools": "Install Xcode Command Line Tools",
    "env.openGitScm": "Download from git-scm.com",

    // Settings panel
    "settings.title": "Settings",
    "settings.close": "Close",
    "settings.environment": "Environment",
    "settings.apiKeys": "API Keys",
    "settings.setAsActive": "Set as active",
    "settings.del": "Del",

    // Proxy
    "settings.proxy": "Network Proxy",
    "proxy.url": "Proxy URL",
    "proxy.urlPlaceholder": "http://127.0.0.1:7890",
    "proxy.save": "Save",
    "proxy.clear": "Clear",
    "proxy.saved": "Proxy saved",
    "proxy.cleared": "Proxy cleared",
    "proxy.enabled": "Enabled",
    "proxy.disabled": "Disabled",
    "proxy.hint": "Proxy applies to Git, npm, terminal, and API requests. Supports HTTP/HTTPS/SOCKS5.",


    // SessionItem
    "session.deleteSession": "Delete Session",
    "session.deleteConfirm": "Delete \"{title}\" and all its threads?",

    // ConfirmDialog
    "confirm.cancel": "Cancel",
    "confirm.ok": "OK",
    "confirm.delete": "Delete",

    // SearchResults
    "search.noResults": "No results found",

    // MessageItem
    "message.user": "user",
    "message.assistant": "assistant",

    // MessageList
    "message.thinking": "Thinking...",

    // ProviderModelModeBar
    "thread.nameTemplate": "{provider} thread",

    // File Search
    "fileSearch.placeholder": "Search in files...",
    "fileSearch.noResults": "No matches found",
    "fileSearch.results": "matches",

    // File Viewer / Editor
    "fileViewer.close": "Close File",
    "fileViewer.tooLarge": "File too large, showing first {lines} lines",
    "fileViewer.line": "Line",
    "fileViewer.save": "Save (Cmd+S)",
    "fileViewer.saved": "Saved",
    "fileViewer.largeFileMode": "Large file mode",
    "fileViewer.largeFileModeHint": "Syntax and completion disabled; editing, search and save remain available",
    "fileViewer.unsavedChanges": "File has unsaved changes. Close anyway?",
    "fileViewer.dontSave": "Don't Save",
    "fileViewer.preview": "Preview",
    "fileViewer.edit": "Edit",

    // Quick Open
    "quickOpen.placeholder": "Search file by name... (Cmd+P)",
    "quickOpen.noResults": "No matching files",

    // Git Stash
    "git.stash": "Stash",
    "git.stashSave": "Stash",
    "git.stashApply": "Apply",
    "git.stashDrop": "Drop",
    "git.stashSaved": "Changes stashed",
    "git.stashApplied": "Stash applied",
    "git.stashDropped": "Stash dropped",
    "git.stashDropConfirm": "Drop this stash entry? This cannot be undone.",
    "git.stashNothingToSave": "Nothing to stash",

    // Git Tag
    "git.tags": "Tags",
    "git.createTag": "Create Tag",
    "git.deleteTag": "Delete Tag",
    "git.pushTag": "Push Tag",
    "git.tagName": "Tag name",
    "git.tagMessage": "Tag message (optional)",
    "git.annotatedTag": "Annotated tag",
    "git.tagCreated": "Tag created",
    "git.tagDeleted": "Tag deleted",
    "git.tagPushed": "Tag pushed",
    "git.deleteTagConfirm": "Delete tag \"{name}\"? This cannot be undone.",
    "git.noTags": "No tags",

    // Font Size
    "fontSize.title": "Font Size",
    "fontSize.editor": "Editor",
    "fontSize.terminal": "Terminal",
    "fontSize.chat": "Chat",
    "terminal.settings": "Terminal",
    "terminal.scrollback": "Scrollback",
    "terminal.lines": "lines",
    "terminal.lineHeight": "Line Height",
    "terminal.renderer": "Renderer",
    "terminal.rendererDom": "DOM (most stable)",
    "terminal.rendererWebgl": "WebGL (fast)",

    // Shortcuts Reference
    "shortcuts.title": "Keyboard Shortcuts",
    "shortcuts.global": "Global",
    "shortcuts.editor": "Editor",
    "shortcuts.terminal": "Terminal",
    "shortcuts.chat": "Chat",
    "shortcuts.git": "Git",
    "shortcuts.quickOpen": "Quick Open File",
    "shortcuts.newSession": "New Session",
    "shortcuts.send": "Send Message",
    "shortcuts.focusSearch": "Focus Search",
    "shortcuts.close": "Close / Cancel",
    "shortcuts.save": "Save File",
    "shortcuts.indent": "Indent",
    "shortcuts.undo": "Undo",
    "shortcuts.redo": "Redo",
    "shortcuts.find": "Find",
    "shortcuts.termSearch": "Search Terminal",
    "shortcuts.termClear": "Clear Terminal",
    "shortcuts.termCopy": "Copy Selection / Interrupt",
    "shortcuts.termPaste": "Paste",
    "shortcuts.termNewline": "Newline",
    "shortcuts.chatSend": "Send Message",
    "shortcuts.chatNewline": "Newline",
    "shortcuts.closePane": "Close Current Panel",
    "shortcuts.gitCommit": "Commit",


    // Loading
    "loading": "Loading...",


    // Coding CLIs
    "cli.settingsTitle": "Coding CLI",
    "cli.setupTitle": "Choose a coding CLI",
    "cli.setupSubtitle": "OMP / Pi reuse their own existing login and model configuration, including support for Anthropic / Claude models.",
    "cli.setupPreservation": "This app does not copy credentials, write shell API environment variables, or rewrite existing CLI configuration and history. In-app AI chat provider settings remain separate.",
    "cli.guide.title": "CLI and Project Rules Guide",
    "cli.guide.sessions": "Start and Restore Sessions",
    "cli.guide.selected": "Selected: {cli}. Change it in settings or the terminal toolbar; your selection is saved.",
    "cli.guide.projectDirectory": "Run these commands in a terminal in your project directory, or use the matching session actions in the terminal toolbar.",
    "cli.guide.new": "New session",
    "cli.guide.newHint": "The toolbar's New session action always starts fresh. The plain command below follows the CLI's own automatic-resume configuration.",
    "cli.guide.continue": "Continue the latest session",
    "cli.guide.continueHint": "Continue the current CLI's most recently saved session for the current project directory.",
    "cli.guide.resume": "Choose a past session",
    "cli.guide.resumeHint": "Open the current CLI's session picker, then choose a session to restore.",
    "cli.guide.separateSessions": "OMP and Pi manage their own sessions. Switching CLI does not convert or delete history. Existing Claude Code configuration and history are also left untouched.",
    "cli.guide.models": "Login and Models",
    "cli.guide.modelCommands": "Use /login inside the CLI to sign in to a supported provider, and /model to select a model. Existing credentials remain usable through that CLI's configuration.",
    "cli.guide.rules": "Project Rules and Persistent Knowledge",
    "cli.guide.rulesHint": "Maintain AGENTS.md at the project root so tools can read project conventions through their own context-loading rules. Check your team's existing rules before deciding whether to edit them.",
    "cli.guide.rulesContent": "Record project structure, build and test commands, coding conventions, and constraints. Never put credentials in rule files.",
    "cli.guide.rulesCompatibility": "Existing CLAUDE.md files can remain in use through the selected CLI's compatibility loading rules; switching CLI does not require rewriting them. This guide does not create or modify rule files.",
    "cli.guide.memoryScope": "Session history, project rules, and CLI memory features are distinct. Saying “remember” does not guarantee persistence across sessions. Explicitly save important conventions in project rules; memory capabilities depend on the selected CLI's configuration.",
    "cli.guide.approval": "Tool Approval",
    "cli.guide.ompApproval": "OMP supports the default policy, always ask (--approval-mode=always-ask), and auto-approve (--auto-approve). Toolbar launches apply the saved policy. Auto-approve reduces manual confirmation; use it only in trusted projects.",
    "cli.guide.piApproval": "Pi does not offer equivalent tool-approval launch flags, so only the default policy is used. --approve controls project trust, not tool execution approval; this app does not use it as an approval setting.",
    "cli.selection": "Coding CLI",
    "cli.approval": "Tool approval",
    "cli.approvalDefault": "Follow configuration",
    "cli.approvalAlwaysAsk": "Ask every time",
    "cli.approvalAutoApprove": "Auto-approve all tools",
    "cli.autoApproveTitle": "Auto-approve all tools?",
    "cli.autoApproveWarning": "OMP will automatically approve all tool operations, including command execution and file reads and writes, without asking each time. This may modify or delete project files and execute risky commands. Enable only when you trust the current project and task.",
    "cli.autoApproveConfirm": "Enable auto-approval",
    "cli.saveFailed": "Failed to save CLI settings",
    "cli.ompApprovalHint": "Applies the next time the CLI starts. “Follow configuration” preserves OMP’s own approval policy.",
    "cli.piTrustHint": "Pi executes tools directly by default. Project resource trust controls loading project configuration and extensions, not per-tool approval; this app does not pass --approve to Pi.",
    "cli.installNative": "Native",
    "cli.installBun": "Bun",
    "cli.installBrew": "Homebrew",
    "cli.ompNativeHint": "Native OMP installation does not require Node.js or Bun.",
    "cli.bunRuntimeRequired": "The Bun channel requires Bun ≥1.3.14.",
    "cli.piRuntimeRequired": "Installing Pi with npm requires Node.js ≥22.19.0 and an available npm.",
    "cli.install": "Install",
    "cli.openBun": "Install Bun from bun.sh",
    "cli.unknownError": "Unknown error",
    "cli.continue": "Continue",
    "cli.resume": "Choose session",
    "cli.newSession": "New session",
    "cli.launchFailed": "Failed to start {cli}",
    "cli.notInstalled": "{cli} is unavailable; install it or refresh the environment check",
    "cli.sessionActions": "Coding CLI session actions",

    // Language toggle
    "locale.toggle": "EN/中",
  },
};

export const useI18n = create<I18nState>((set, get) => ({
  locale: "zh",

  t: (key: string) => {
    const { locale } = get();
    return translations[locale][key] ?? key;
  },

  toggleLocale: () => {
    const newLocale = get().locale === "zh" ? "en" : "zh";
    set({ locale: newLocale });
    ipc.setSetting("locale", newLocale).catch(() => {});
  },

  loadLocale: async () => {
    try {
      const saved = await ipc.getSetting("locale");
      if (saved === "en" || saved === "zh") {
        set({ locale: saved as Locale });
      }
    } catch {
      // Ignore errors, keep default
    }
  },
}));
