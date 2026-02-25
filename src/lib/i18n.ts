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

    // TopBar - Theme
    "topbar.switchTheme": "切换主题",

    // SetupWizard
    "wizard.welcome": "欢迎使用拾光 AI 编程平台",
    "wizard.welcomeSubtitle": "一个集成 Git 的 AI 编程辅助桌面平台。让我们来设置您的环境。",
    "wizard.skipSetup": "跳过设置",
    "wizard.getStarted": "开始设置",
    "wizard.back": "上一步",
    "wizard.next": "下一步",
    "wizard.skip": "跳过",
    "wizard.finishSetup": "完成设置",
    "wizard.apiConfig": "API 环境配置",
    "wizard.apiConfigSubtitle": "配置 Anthropic API 环境变量，用于 AI 编程助手。",
    "wizard.alreadyConfigured": "我已经配置过了",
    "wizard.notConfigured": "我还没有配置",
    "wizard.baseUrl": "Base URL",
    "wizard.baseUrlPlaceholder": "请填入 API 地址",
    "wizard.authToken": "Auth Token",
    "wizard.preview": "将写入以下内容到",
    "wizard.writeToShell": "写入配置",
    "wizard.writeConfirm": "即将向 {path} 追加以下环境变量:\n\n{content}\n\n是否继续？",
    "wizard.writeSuccess": "环境变量已写入 {path}",
    "wizard.writeHintAuto": "本应用终端将自动加载这些环境变量",
    "wizard.writeHintExternal": "外部终端需执行 source {path} 或重启后生效",
    "wizard.writeHintWindows": "已写入系统环境变量，新打开的终端和程序将自动生效",
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
    "env.install": "安装 Claude CLI",
    "env.update": "更新",
    "env.installing": "安装中...",
    "env.installSuccess": "安装成功！",
    "env.installError": "安装失败",
    "env.openNodejsOrg": "前往 nodejs.org 下载",
    "env.installViaBrew": "通过 brew 安装",
    "env.detecting": "正在检测开发环境...",
    "env.detectRefresh": "重新检测",
    "env.installedVia": "安装方式:",
    "env.needNodeFirst": "需要先安装 Node.js",

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

    // File Viewer
    "fileViewer.close": "关闭文件",
    "fileViewer.tooLarge": "文件过大，仅显示前 {lines} 行",
    "fileViewer.line": "行",

    // Loading
    "loading": "加载中...",

    // Language toggle
    "locale.toggle": "中/EN",
  },
  en: {
    // TopBar
    "topbar.title": "拾光 AI 编程平台",
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

    // TopBar - Theme
    "topbar.switchTheme": "Switch Theme",

    // SetupWizard
    "wizard.welcome": "Welcome to ShiGuang AI Coding Platform",
    "wizard.welcomeSubtitle": "A desktop platform for AI-assisted coding with Git integration. Let's set up your environment.",
    "wizard.skipSetup": "Skip Setup",
    "wizard.getStarted": "Get Started",
    "wizard.back": "Back",
    "wizard.next": "Next",
    "wizard.skip": "Skip",
    "wizard.finishSetup": "Finish Setup",
    "wizard.apiConfig": "API Configuration",
    "wizard.apiConfigSubtitle": "Configure Anthropic API environment variables for the AI coding assistant.",
    "wizard.alreadyConfigured": "I've already configured this",
    "wizard.notConfigured": "I haven't configured yet",
    "wizard.baseUrl": "Base URL",
    "wizard.baseUrlPlaceholder": "Enter API address",
    "wizard.authToken": "Auth Token",
    "wizard.preview": "The following will be written to",
    "wizard.writeToShell": "Write Config",
    "wizard.writeConfirm": "The following environment variables will be appended to {path}:\n\n{content}\n\nContinue?",
    "wizard.writeSuccess": "Environment variables written to {path}",
    "wizard.writeHintAuto": "The app's terminal will automatically load these variables",
    "wizard.writeHintExternal": "External terminals need to run source {path} or restart to apply",
    "wizard.writeHintWindows": "Written to system environment variables. New terminals and apps will pick them up automatically",
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
    "env.install": "Install Claude CLI",
    "env.update": "Update",
    "env.installing": "Installing...",
    "env.installSuccess": "Installed successfully!",
    "env.installError": "Installation failed",
    "env.openNodejsOrg": "Download from nodejs.org",
    "env.installViaBrew": "Install via brew",
    "env.detecting": "Detecting environment...",
    "env.detectRefresh": "Re-detect",
    "env.installedVia": "Installed via:",
    "env.needNodeFirst": "Node.js must be installed first",

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

    // File Viewer
    "fileViewer.close": "Close File",
    "fileViewer.tooLarge": "File too large, showing first {lines} lines",
    "fileViewer.line": "Line",

    // Loading
    "loading": "Loading...",

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
