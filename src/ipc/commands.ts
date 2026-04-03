import { invoke } from "@tauri-apps/api/core";
import type {
  Workspace,
  Project,
  Session,
  Thread,
  Message,
  DirEntry,
  GitFileStatus,
  GitLogEntry,
  GitBranchInfo,
  BranchListItem,
  StashEntry,
  TagEntry,
  ChatMessage,
} from "../lib/types";

// --- Workspaces ---

export const createWorkspace = (name: string) =>
  invoke<Workspace>("create_workspace", { name });

export const listWorkspaces = () =>
  invoke<Workspace[]>("list_workspaces");

export const getWorkspace = (id: string) =>
  invoke<Workspace | null>("get_workspace", { id });

export const updateWorkspace = (id: string, name: string, projectIdsJson: string) =>
  invoke<void>("update_workspace", { id, name, projectIdsJson });

export const deleteWorkspace = (id: string) =>
  invoke<void>("delete_workspace", { id });

export const updateWorkspaceTimestamp = (id: string) =>
  invoke<void>("update_workspace_timestamp", { id });

// --- Projects ---

export const createProject = (path: string, name: string) =>
  invoke<Project>("create_project", { path, name });

export const listProjects = () =>
  invoke<Project[]>("list_projects");

export const getProject = (id: string) =>
  invoke<Project | null>("get_project", { id });

export const updateProjectLastOpened = (id: string) =>
  invoke<void>("update_project_last_opened", { id });

export const renameProject = (id: string, name: string) =>
  invoke<void>("rename_project", { id, name });

export const deleteProject = (id: string) =>
  invoke<void>("delete_project", { id });

// --- Sessions ---

export const createSession = (projectId: string, title: string) =>
  invoke<Session>("create_session", { projectId, title });

export const listSessions = (projectId: string) =>
  invoke<Session[]>("list_sessions", { projectId });

export const listAllSessions = () =>
  invoke<Session[]>("list_all_sessions");

export const getSession = (id: string) =>
  invoke<Session | null>("get_session", { id });

export const updateSession = (id: string, title?: string, pinned?: boolean) =>
  invoke<void>("update_session", { id, title, pinned });

export const deleteSession = (id: string) =>
  invoke<void>("delete_session", { id });

// --- Threads ---

export const createThread = (
  sessionId: string,
  title: string,
  provider: string,
  model: string,
  mode: string,
  sourceThreadId?: string,
  handoffMetaJson?: string
) =>
  invoke<Thread>("create_thread", {
    sessionId,
    title,
    provider,
    model,
    mode,
    sourceThreadId,
    handoffMetaJson,
  });

export const listThreads = (sessionId: string) =>
  invoke<Thread[]>("list_threads", { sessionId });

export const getThread = (id: string) =>
  invoke<Thread | null>("get_thread", { id });

export const updateThread = (
  id: string,
  title?: string,
  lastModel?: string,
  lastMode?: string,
  pinned?: boolean
) =>
  invoke<void>("update_thread", { id, title, lastModel, lastMode, pinned });

export const deleteThread = (id: string) =>
  invoke<void>("delete_thread", { id });

// --- Messages ---

export const createMessage = (
  threadId: string,
  role: string,
  content: string,
  provider: string,
  model: string,
  mode: string
) =>
  invoke<Message>("create_message", {
    threadId,
    role,
    content,
    provider,
    model,
    mode,
  });

export const listMessages = (threadId: string) =>
  invoke<Message[]>("list_messages", { threadId });

export const searchMessages = (query: string) =>
  invoke<Message[]>("search_messages", { query });

// --- Settings ---

export const getSetting = (key: string) =>
  invoke<unknown | null>("get_setting", { key });

export const setSetting = (key: string, value: unknown) =>
  invoke<void>("set_setting", { key, value });

// --- Proxy ---

export const setProxy = (url: string) =>
  invoke<void>("set_proxy", { url });

export const getProxy = () =>
  invoke<string | null>("get_proxy");

// --- Keychain ---

export const setApiKey = (provider: string, apiKey: string) =>
  invoke<void>("set_api_key", { provider, apiKey });

export const hasApiKey = (provider: string) =>
  invoke<boolean>("has_api_key", { provider });

export const deleteApiKey = (provider: string) =>
  invoke<void>("delete_api_key", { provider });

export const detectEnvApiKeys = () =>
  invoke<Record<string, string>>("detect_env_api_keys");

// --- Provider ---

export const sendMessage = (
  threadId: string,
  messages: ChatMessage[],
  provider: string,
  model: string,
  mode: string,
  baseUrl?: string
) =>
  invoke<void>("send_message", {
    threadId,
    messages,
    provider,
    model,
    mode,
    baseUrl,
  });

export const stopStreaming = (threadId: string) =>
  invoke<void>("stop_streaming", { threadId });

export const testApiKey = (
  provider: string,
  apiKey: string,
  baseUrl?: string
) => invoke<boolean>("test_api_key", { provider, apiKey, baseUrl });

// --- Git ---

export const gitStatus = (projectPath: string) =>
  invoke<GitFileStatus[]>("git_status", { projectPath });

export const gitDiff = (projectPath: string) =>
  invoke<string>("git_diff", { projectPath });

export const gitDiffStaged = (projectPath: string) =>
  invoke<string>("git_diff_staged", { projectPath });

export const gitDiffFile = (projectPath: string, filePath: string) =>
  invoke<string>("git_diff_file", { projectPath, filePath });

export const gitDiffStagedFile = (projectPath: string, filePath: string) =>
  invoke<string>("git_diff_staged_file", { projectPath, filePath });

export const gitStageFile = (projectPath: string, filePath: string) =>
  invoke<void>("git_stage_file", { projectPath, filePath });

export const gitUnstageFile = (projectPath: string, filePath: string) =>
  invoke<void>("git_unstage_file", { projectPath, filePath });

export const gitStageAll = (projectPath: string) =>
  invoke<void>("git_stage_all", { projectPath });

export const gitUnstageAll = (projectPath: string) =>
  invoke<void>("git_unstage_all", { projectPath });

export const gitCommit = (projectPath: string, message: string) =>
  invoke<string>("git_commit", { projectPath, message });

export const gitPull = (projectPath: string) =>
  invoke<string>("git_pull", { projectPath });

export const gitPush = (projectPath: string) =>
  invoke<string>("git_push", { projectPath });

export const gitDiscardFile = (projectPath: string, filePath: string) =>
  invoke<void>("git_discard_file", { projectPath, filePath });

export const gitBranchInfo = (projectPath: string) =>
  invoke<GitBranchInfo>("git_branch_info", { projectPath });

export const gitLog = (projectPath: string) =>
  invoke<GitLogEntry[]>("git_log", { projectPath });

export const gitInitRepo = (projectPath: string, remoteUrl?: string) =>
  invoke<void>("git_init_repo", { projectPath, remoteUrl });

export const gitListBranches = (projectPath: string) =>
  invoke<BranchListItem[]>("git_list_branches", { projectPath });

export const gitCheckoutBranch = (projectPath: string, branchName: string) =>
  invoke<void>("git_checkout_branch", { projectPath, branchName });

export const gitCreateBranch = (projectPath: string, branchName: string) =>
  invoke<void>("git_create_branch", { projectPath, branchName });

export const gitDeleteBranch = (projectPath: string, branchName: string, force: boolean) =>
  invoke<void>("git_delete_branch", { projectPath, branchName, force });

export const generateCommitMessage = (projectPath: string) =>
  invoke<string>("generate_commit_message", { projectPath });

// --- Git Stash ---

export const gitStashList = (projectPath: string) =>
  invoke<StashEntry[]>("git_stash_list", { projectPath });

export const gitStashSave = (projectPath: string, message?: string) =>
  invoke<void>("git_stash_save", { projectPath, message });

export const gitStashApply = (projectPath: string, index: number) =>
  invoke<void>("git_stash_apply", { projectPath, index });

export const gitStashDrop = (projectPath: string, index: number) =>
  invoke<void>("git_stash_drop", { projectPath, index });

// --- Git Conflict ---

export const gitResolveOurs = (projectPath: string, filePath: string) =>
  invoke<void>("git_resolve_ours", { projectPath, filePath });

export const gitResolveTheirs = (projectPath: string, filePath: string) =>
  invoke<void>("git_resolve_theirs", { projectPath, filePath });

export const gitMergeAbort = (projectPath: string) =>
  invoke<void>("git_merge_abort", { projectPath });

// --- Git Tag ---

export const gitTagList = (projectPath: string) =>
  invoke<TagEntry[]>("git_tag_list", { projectPath });

export const gitCreateTag = (projectPath: string, tagName: string, message?: string, annotated?: boolean) =>
  invoke<void>("git_create_tag", { projectPath, tagName, message, annotated });

export const gitDeleteTag = (projectPath: string, tagName: string) =>
  invoke<void>("git_delete_tag", { projectPath, tagName });

export const gitPushTag = (projectPath: string, tagName: string) =>
  invoke<string>("git_push_tag", { projectPath, tagName });

// --- Project filesystem ---

export const readDirectoryTree = (path: string, maxDepth?: number) =>
  invoke<DirEntry[]>("read_directory_tree", { path, maxDepth });

export const readDirectoryChildren = (path: string) =>
  invoke<DirEntry[]>("read_directory_children", { path });

export const readFileContent = (path: string, maxSize?: number) =>
  invoke<string>("read_file_content", { path, maxSize });

export const writeFileContent = (path: string, content: string) =>
  invoke<void>("write_file_content", { path, content });

export const createFileOrDir = (path: string, isDir: boolean) =>
  invoke<void>("create_file_or_dir", { path, isDir });

export const renameEntry = (oldPath: string, newPath: string) =>
  invoke<void>("rename_entry", { oldPath, newPath });

export const deleteEntry = (path: string) =>
  invoke<void>("delete_entry", { path });

export interface FileSearchResult {
  path: string;
  line_number: number;
  line_content: string;
}

export const searchInFiles = (projectPath: string, query: string, maxResults?: number) =>
  invoke<FileSearchResult[]>("search_in_files", { projectPath, query, maxResults });

export const showInFolder = (path: string) =>
  invoke<void>("show_in_folder", { path });

export const listAllFiles = (projectPath: string) =>
  invoke<string[]>("list_all_files", { projectPath });

// --- Env ---

export const writeEnvToShell = (baseUrl: string, authToken: string) =>
  invoke<string>("write_env_to_shell", { baseUrl, authToken });

export const getShellConfigPath = () =>
  invoke<string>("get_shell_config_path");

export const detectPlatform = () =>
  invoke<string>("detect_platform");

export const getClaudeResumeEnabled = () =>
  invoke<boolean>("get_claude_resume_enabled");

export const setClaudeResumeEnabled = (enabled: boolean) =>
  invoke<string>("set_claude_resume_enabled", { enabled });

export const fetchUrl = (url: string) =>
  invoke<string>("fetch_url", { url });

// --- Setup ---

export interface EnvCheckResult {
  git_installed: boolean;
  git_version: string | null;
  node_installed: boolean;
  node_version: string | null;
  npm_installed: boolean;
  npm_version: string | null;
  brew_installed: boolean;
  claude_installed: boolean;
  claude_version: string | null;
  claude_install_method: string | null; // "npm" | "brew"
  claude_latest_version: string | null;
  claude_update_available: boolean;
  platform: string;
}

export const checkEnvironment = () =>
  invoke<EnvCheckResult>("check_environment");

export const runInstallCommand = (commandType: string, method: string) =>
  invoke<void>("run_install_command", { commandType, method });

// --- Terminal ---

export const spawnTerminal = (initialDir?: string, rows?: number, cols?: number) =>
  invoke<[string, string]>("spawn_terminal", { initialDir, rows, cols });

export const writeTerminal = (sessionId: string, data: string) =>
  invoke<void>("write_terminal", { sessionId, data });

export const resizeTerminal = (sessionId: string, rows: number, cols: number) =>
  invoke<void>("resize_terminal", { sessionId, rows, cols });

export const killTerminal = (sessionId: string) =>
  invoke<void>("kill_terminal", { sessionId });

export const terminalCd = (sessionId: string, path: string) =>
  invoke<void>("terminal_cd", { sessionId, path });

export const isTerminalIdle = (sessionId: string) =>
  invoke<boolean>("is_terminal_idle", { sessionId });

export const warmupTerminal = (initialDir?: string) =>
  invoke<void>("warmup_terminal", { initialDir });

export const claimWarmupTerminal = (initialDir?: string, rows?: number, cols?: number) =>
  invoke<[string, string] | null>("claim_warmup_terminal", { initialDir, rows, cols });
