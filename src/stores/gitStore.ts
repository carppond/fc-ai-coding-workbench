import { create } from "zustand";
import type { GitFileStatus, GitBranchInfo, GitLogEntry, BranchListItem, StashEntry, TagEntry } from "../lib/types";
import * as ipc from "../ipc/commands";

function extractErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as Record<string, unknown>).message === "string") {
    return (e as Record<string, unknown>).message as string;
  }
  return String(e);
}

interface SelectedFile {
  path: string;
  staged: boolean;
}

/** 单个仓库的 git 状态（用于多仓库并行展示） */
export interface RepoGitState {
  fileStatuses: GitFileStatus[];
  branchInfo: GitBranchInfo | null;
  commitMessage: string;
  isGitRepo: boolean;
  loading: boolean;
  operating: boolean;
  operationType: "commit" | "pull" | "push" | null;
  generating: boolean;
  error: string | null;
  stashEntries: StashEntry[];
  tagEntries: TagEntry[];
}

function makeEmptyRepoState(): RepoGitState {
  return {
    fileStatuses: [],
    branchInfo: null,
    commitMessage: "",
    isGitRepo: false,
    loading: false,
    operating: false,
    operationType: null,
    generating: false,
    error: null,
    stashEntries: [],
    tagEntries: [],
  };
}

/** 从扁平 gitStore 状态提取 RepoGitState 快照 */
function snapshotRepoState(s: GitState): RepoGitState {
  return {
    fileStatuses: s.fileStatuses,
    branchInfo: s.branchInfo,
    commitMessage: s.commitMessage,
    isGitRepo: s.isGitRepo,
    loading: s.loading,
    operating: s.operating,
    operationType: s.operationType,
    generating: s.generating,
    error: s.error,
    stashEntries: s.stashEntries,
    tagEntries: s.tagEntries,
  };
}

interface GitState {
  fileStatuses: GitFileStatus[];
  branchInfo: GitBranchInfo | null;
  logEntries: GitLogEntry[];
  branches: BranchListItem[];
  stashEntries: StashEntry[];
  tagEntries: TagEntry[];
  diffText: string;
  diffStagedText: string;
  selectedFile: SelectedFile | null;
  selectedFileDiff: string;
  commitMessage: string;
  loading: boolean;
  operating: boolean;
  operationType: "commit" | "pull" | "push" | null;
  generating: boolean;
  error: string | null;
  isGitRepo: boolean;

  refresh: (projectPath: string) => Promise<void>;
  refreshLite: (projectPath: string) => Promise<void>;
  loadLog: (projectPath: string) => Promise<void>;
  loadDiff: (projectPath: string) => Promise<void>;
  loadDiffStaged: (projectPath: string) => Promise<void>;
  loadBranches: (projectPath: string) => Promise<void>;
  checkoutBranch: (projectPath: string, branchName: string) => Promise<boolean>;
  createBranch: (projectPath: string, branchName: string) => Promise<boolean>;
  deleteBranch: (projectPath: string, branchName: string, force: boolean) => Promise<boolean>;
  loadStash: (projectPath: string) => Promise<void>;
  stashSave: (projectPath: string, message?: string) => Promise<boolean>;
  stashApply: (projectPath: string, index: number) => Promise<boolean>;
  stashDrop: (projectPath: string, index: number) => Promise<boolean>;
  loadTags: (projectPath: string) => Promise<void>;
  createTag: (projectPath: string, name: string, message?: string, annotated?: boolean) => Promise<boolean>;
  deleteTag: (projectPath: string, name: string) => Promise<boolean>;
  pushTag: (projectPath: string, name: string) => Promise<boolean>;
  selectFile: (projectPath: string, filePath: string, staged: boolean) => Promise<void>;
  reloadSelectedFileDiff: (projectPath: string) => Promise<void>;
  clearSelectedFile: () => void;
  stageFile: (projectPath: string, filePath: string) => Promise<void>;
  unstageFile: (projectPath: string, filePath: string) => Promise<void>;
  stageAll: (projectPath: string) => Promise<void>;
  unstageAll: (projectPath: string) => Promise<void>;
  discardFile: (projectPath: string, filePath: string) => Promise<void>;
  initRepo: (projectPath: string, remoteUrl?: string) => Promise<boolean>;
  commit: (projectPath: string) => Promise<boolean>;
  pull: (projectPath: string) => Promise<boolean>;
  push: (projectPath: string) => Promise<boolean>;
  generateCommitMessage: (projectPath: string) => Promise<boolean>;
  setCommitMessage: (msg: string) => void;
  clearError: () => void;
  reset: () => void;

  /* ── 多仓库支持 ── */
  repoStates: Record<string, RepoGitState>;
  activeRepoPath: string | null;
  refreshRepo: (projectPath: string) => Promise<void>;
  refreshAllRepos: (projectPaths: string[]) => Promise<void>;
  setActiveRepo: (projectPath: string | null) => void;
  getRepoState: (projectPath: string) => RepoGitState;
  setRepoCommitMessage: (projectPath: string, msg: string) => void;
}

// Cancellation controller for refresh — only the latest refresh applies
let refreshController: AbortController | null = null;

export const useGitStore = create<GitState>((set, get) => ({
  fileStatuses: [],
  branchInfo: null,
  logEntries: [],
  branches: [],
  stashEntries: [],
  tagEntries: [],
  diffText: "",
  diffStagedText: "",
  selectedFile: null,
  selectedFileDiff: "",
  commitMessage: "",
  loading: false,
  operating: false,
  operationType: null,
  generating: false,
  error: null,
  isGitRepo: false,
  repoStates: {},
  activeRepoPath: null,

  refresh: async (projectPath) => {
    // Skip polling refresh while an operation is running
    if (get().operating) return;

    // Cancel any in-flight refresh
    if (refreshController) refreshController.abort();
    const controller = new AbortController();
    refreshController = controller;
    const signal = controller.signal;

    set({ loading: true });

    let statuses: GitFileStatus[] = [];
    let branch: GitBranchInfo | null = null;
    let isGitRepo = false;

    try {
      statuses = await ipc.gitStatus(projectPath);
      isGitRepo = true;
    } catch {
      // Not a git repo or other error
    }

    if (signal.aborted) return;

    try {
      branch = await ipc.gitBranchInfo(projectPath);
    } catch {
      if (isGitRepo) branch = get().branchInfo;
    }

    if (signal.aborted) return;

    set({ fileStatuses: statuses, branchInfo: branch, isGitRepo, loading: false });

    // 同步到 repoStates
    set((s) => ({
      repoStates: {
        ...s.repoStates,
        [projectPath]: { ...snapshotRepoState(get()), fileStatuses: statuses, branchInfo: branch, isGitRepo, loading: false },
      },
    }));

    if (!isGitRepo) return;

    // Reload diffs and log in parallel, respecting cancellation
    const loadDiff = async () => {
      try {
        const diff = await ipc.gitDiff(projectPath);
        if (!signal.aborted) set({ diffText: diff });
      } catch {
        if (!signal.aborted) set({ diffText: "" });
      }
    };
    const loadDiffStaged = async () => {
      try {
        const diff = await ipc.gitDiffStaged(projectPath);
        if (!signal.aborted) set({ diffStagedText: diff });
      } catch {
        if (!signal.aborted) set({ diffStagedText: "" });
      }
    };
    const loadLog = async () => {
      try {
        const entries = await ipc.gitLog(projectPath);
        if (!signal.aborted) set({ logEntries: entries });
      } catch {
        if (!signal.aborted) set({ logEntries: [] });
      }
    };

    const loadStash = async () => {
      try {
        const entries = await ipc.gitStashList(projectPath);
        if (!signal.aborted) set({ stashEntries: entries });
      } catch {
        if (!signal.aborted) set({ stashEntries: [] });
      }
    };

    const loadTags = async () => {
      try {
        const entries = await ipc.gitTagList(projectPath);
        if (!signal.aborted) set({ tagEntries: entries });
      } catch {
        if (!signal.aborted) set({ tagEntries: [] });
      }
    };

    await Promise.all([loadDiff(), loadDiffStaged(), loadLog(), loadStash(), loadTags()]);

    // 同步 stash/tags 到 repoStates
    if (!signal.aborted) {
      set((s) => ({
        repoStates: {
          ...s.repoStates,
          [projectPath]: { ...(s.repoStates[projectPath] || makeEmptyRepoState()), stashEntries: s.stashEntries, tagEntries: s.tagEntries },
        },
      }));
    }

    // Reload selected file diff if it still exists
    if (signal.aborted) return;
    const sel = get().selectedFile;
    if (sel) {
      const stillExists = statuses.some((f) => f.path === sel.path && f.staged === sel.staged);
      if (stillExists) {
        get().reloadSelectedFileDiff(projectPath);
      } else {
        set({ selectedFile: null, selectedFileDiff: "" });
      }
    }
  },

  refreshLite: async (projectPath) => {
    // Lightweight refresh: only status + branchInfo (skip diff/log)
    if (get().operating) return;

    let statuses: GitFileStatus[] = [];
    let branch: GitBranchInfo | null = null;
    let isGitRepo = false;

    try {
      statuses = await ipc.gitStatus(projectPath);
      isGitRepo = true;
    } catch {
      // Not a git repo or other error
    }

    try {
      branch = await ipc.gitBranchInfo(projectPath);
    } catch {
      if (isGitRepo) branch = get().branchInfo;
    }

    // 浅比较：数据未变则跳过 set()，避免触发无意义的重渲染
    const prev = get();
    const statusChanged = !_shallowEqualStatuses(prev.fileStatuses, statuses);
    const branchChanged = !_shallowEqualBranch(prev.branchInfo, branch);
    const repoChanged = prev.isGitRepo !== isGitRepo;
    if (statusChanged || branchChanged || repoChanged) {
      const update: Partial<GitState> = {};
      if (statusChanged) update.fileStatuses = statuses;
      if (branchChanged) update.branchInfo = branch;
      if (repoChanged) update.isGitRepo = isGitRepo;
      set(update);
    }

    // 同步到 repoStates（无论扁平字段是否更新）
    set((s) => {
      const prev = s.repoStates[projectPath] || makeEmptyRepoState();
      const repoStatusChanged = !_shallowEqualStatuses(prev.fileStatuses, statuses);
      const repoBranchChanged = !_shallowEqualBranch(prev.branchInfo, branch);
      const repoRepoChanged = prev.isGitRepo !== isGitRepo;
      if (!repoStatusChanged && !repoBranchChanged && !repoRepoChanged) return {};
      return {
        repoStates: {
          ...s.repoStates,
          [projectPath]: { ...prev, fileStatuses: statuses, branchInfo: branch, isGitRepo },
        },
      };
    });
  },

  loadLog: async (projectPath) => {
    try {
      const entries = await ipc.gitLog(projectPath);
      set({ logEntries: entries });
    } catch {
      set({ logEntries: [] });
    }
  },

  loadDiff: async (projectPath) => {
    try {
      const diff = await ipc.gitDiff(projectPath);
      set({ diffText: diff });
    } catch {
      set({ diffText: "" });
    }
  },

  loadDiffStaged: async (projectPath) => {
    try {
      const diff = await ipc.gitDiffStaged(projectPath);
      set({ diffStagedText: diff });
    } catch {
      set({ diffStagedText: "" });
    }
  },

  loadBranches: async (projectPath) => {
    try {
      const branches = await ipc.gitListBranches(projectPath);
      set({ branches });
    } catch {
      set({ branches: [] });
    }
  },

  checkoutBranch: async (projectPath, branchName) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitCheckoutBranch(projectPath, branchName);
      set({ operating: false });
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  createBranch: async (projectPath, branchName) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitCreateBranch(projectPath, branchName);
      set({ operating: false });
      get().loadBranches(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  deleteBranch: async (projectPath, branchName, force) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitDeleteBranch(projectPath, branchName, force);
      set({ operating: false });
      get().loadBranches(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  loadStash: async (projectPath) => {
    try {
      const entries = await ipc.gitStashList(projectPath);
      set({ stashEntries: entries });
    } catch {
      set({ stashEntries: [] });
    }
  },

  stashSave: async (projectPath, message) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitStashSave(projectPath, message);
      set({ operating: false });
      get().refresh(projectPath);
      get().loadStash(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  stashApply: async (projectPath, index) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitStashApply(projectPath, index);
      set({ operating: false });
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  stashDrop: async (projectPath, index) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitStashDrop(projectPath, index);
      set({ operating: false });
      get().loadStash(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  loadTags: async (projectPath) => {
    try {
      const entries = await ipc.gitTagList(projectPath);
      set({ tagEntries: entries });
    } catch {
      set({ tagEntries: [] });
    }
  },

  createTag: async (projectPath, name, message, annotated) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitCreateTag(projectPath, name, message, annotated);
      set({ operating: false });
      get().loadTags(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  deleteTag: async (projectPath, name) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitDeleteTag(projectPath, name);
      set({ operating: false });
      get().loadTags(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  pushTag: async (projectPath, name) => {
    if (get().operating) return false;
    set({ operating: true, error: null });
    try {
      await ipc.gitPushTag(projectPath, name);
      set({ operating: false });
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  selectFile: async (projectPath, filePath, staged) => {
    const current = get().selectedFile;
    if (current && current.path === filePath && current.staged === staged) {
      set({ selectedFile: null, selectedFileDiff: "" });
      return;
    }
    set({ selectedFile: { path: filePath, staged } });
    try {
      const diff = staged
        ? await ipc.gitDiffStagedFile(projectPath, filePath)
        : await ipc.gitDiffFile(projectPath, filePath);
      set({ selectedFileDiff: diff });
    } catch {
      set({ selectedFileDiff: "" });
    }
  },

  reloadSelectedFileDiff: async (projectPath) => {
    const sel = get().selectedFile;
    if (!sel) return;
    try {
      const diff = sel.staged
        ? await ipc.gitDiffStagedFile(projectPath, sel.path)
        : await ipc.gitDiffFile(projectPath, sel.path);
      set({ selectedFileDiff: diff });
    } catch {
      set({ selectedFileDiff: "" });
    }
  },

  clearSelectedFile: () => set({ selectedFile: null, selectedFileDiff: "" }),

  // --- File operations: targeted refresh (only status + relevant diff) ---

  stageFile: async (projectPath, filePath) => {
    if (get().operating) return;
    set({ operating: true });
    try {
      await ipc.gitStageFile(projectPath, filePath);
      set({ selectedFile: null, selectedFileDiff: "" });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    } finally {
      set({ operating: false });
      // Targeted refresh: only reload status + diffs (skip log/branchInfo)
      _refreshAfterFileOp(projectPath, set, get);
    }
  },

  unstageFile: async (projectPath, filePath) => {
    if (get().operating) return;
    set({ operating: true });
    try {
      await ipc.gitUnstageFile(projectPath, filePath);
      set({ selectedFile: null, selectedFileDiff: "" });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    } finally {
      set({ operating: false });
      _refreshAfterFileOp(projectPath, set, get);
    }
  },

  stageAll: async (projectPath) => {
    if (get().operating) return;
    set({ operating: true });
    try {
      await ipc.gitStageAll(projectPath);
      set({ selectedFile: null, selectedFileDiff: "" });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    } finally {
      set({ operating: false });
      _refreshAfterFileOp(projectPath, set, get);
    }
  },

  unstageAll: async (projectPath) => {
    if (get().operating) return;
    set({ operating: true });
    try {
      await ipc.gitUnstageAll(projectPath);
      set({ selectedFile: null, selectedFileDiff: "" });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    } finally {
      set({ operating: false });
      _refreshAfterFileOp(projectPath, set, get);
    }
  },

  discardFile: async (projectPath, filePath) => {
    if (get().operating) return;
    set({ operating: true, error: null });
    try {
      await ipc.gitDiscardFile(projectPath, filePath);
      set({ selectedFile: null, selectedFileDiff: "" });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    } finally {
      set({ operating: false });
      _refreshAfterFileOp(projectPath, set, get);
    }
  },

  // --- Heavy operations: full refresh after ---

  initRepo: async (projectPath, remoteUrl) => {
    set({ operating: true, error: null });
    try {
      await ipc.gitInitRepo(projectPath, remoteUrl);
      set({ operating: false });
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false });
      return false;
    }
  },

  commit: async (projectPath) => {
    // 优先从 repoStates 读提交消息（workspace 模式），fallback 到扁平字段
    const repoMsg = get().repoStates[projectPath]?.commitMessage;
    const msg = (repoMsg ?? get().commitMessage).trim();
    if (!msg) return false;
    if (get().operating) return false;
    set({ operating: true, operationType: "commit", error: null });
    try {
      await ipc.gitCommit(projectPath, msg);
      set({ commitMessage: "", selectedFile: null, selectedFileDiff: "", operating: false, operationType: null });
      // 清空 repoStates 中的 commitMessage
      get().setRepoCommitMessage(projectPath, "");
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false, operationType: null });
      return false;
    }
  },

  pull: async (projectPath) => {
    if (get().operating) return false;
    set({ operating: true, operationType: "pull", error: null });
    try {
      await ipc.gitPull(projectPath);
      set({ operating: false, operationType: null });
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false, operationType: null });
      return false;
    }
  },

  push: async (projectPath) => {
    if (get().operating) return false;
    set({ operating: true, operationType: "push", error: null });
    try {
      await ipc.gitPush(projectPath);
      set({ operating: false, operationType: null });
      get().refresh(projectPath);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), operating: false, operationType: null });
      return false;
    }
  },

  generateCommitMessage: async (projectPath) => {
    if (get().generating) return false;
    set({ generating: true, error: null });
    try {
      const msg = await ipc.generateCommitMessage(projectPath);
      set({ commitMessage: msg, generating: false });
      // 同步到 repoStates
      get().setRepoCommitMessage(projectPath, msg);
      return true;
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), generating: false });
      return false;
    }
  },

  setCommitMessage: (msg) => set({ commitMessage: msg }),
  clearError: () => set({ error: null }),
  reset: () => {
    if (refreshController) refreshController.abort();
    set({
      fileStatuses: [],
      branchInfo: null,
      logEntries: [],
      branches: [],
      stashEntries: [],
      tagEntries: [],
      diffText: "",
      diffStagedText: "",
      selectedFile: null,
      selectedFileDiff: "",
      loading: false,
      operating: false,
      operationType: null,
      generating: false,
      error: null,
      isGitRepo: false,
      repoStates: {},
      activeRepoPath: null,
    });
  },

  /* ══════════════════════════════════════════
   *  多仓库方法
   * ══════════════════════════════════════════ */

  /** 轻量刷新单个仓库的 status + branch，只写 repoStates（不影响扁平字段） */
  refreshRepo: async (projectPath) => {
    let statuses: GitFileStatus[] = [];
    let branch: GitBranchInfo | null = null;
    let isGitRepo = false;

    try {
      statuses = await ipc.gitStatus(projectPath);
      isGitRepo = true;
    } catch { /* not a git repo */ }

    try {
      branch = await ipc.gitBranchInfo(projectPath);
    } catch { /* ignore */ }

    // 浅比较：数据未变则跳过 set()，避免不必要的重渲染
    set((s) => {
      const prev = s.repoStates[projectPath];
      if (prev) {
        const statusSame = _shallowEqualStatuses(prev.fileStatuses, statuses);
        const branchSame = _shallowEqualBranch(prev.branchInfo, branch);
        const repoSame = prev.isGitRepo === isGitRepo;
        if (statusSame && branchSame && repoSame) return {};
      }
      const base = prev || makeEmptyRepoState();
      return {
        repoStates: {
          ...s.repoStates,
          [projectPath]: { ...base, fileStatuses: statuses, branchInfo: branch, isGitRepo },
        },
      };
    });
  },

  /** 串行刷新所有仓库的 status + branch（避免并行 IPC 风暴） */
  refreshAllRepos: async (projectPaths) => {
    for (const p of projectPaths) {
      await get().refreshRepo(p);
    }
  },

  /** 切换当前查看的仓库，同步扁平字段 */
  setActiveRepo: (projectPath) => {
    if (!projectPath) {
      set({ activeRepoPath: null });
      return;
    }
    const repo = get().repoStates[projectPath] || makeEmptyRepoState();
    set({
      activeRepoPath: projectPath,
      fileStatuses: repo.fileStatuses,
      branchInfo: repo.branchInfo,
      isGitRepo: repo.isGitRepo,
      stashEntries: repo.stashEntries,
      tagEntries: repo.tagEntries,
      commitMessage: repo.commitMessage,
      operating: repo.operating,
      operationType: repo.operationType,
      generating: repo.generating,
      error: repo.error,
    });
  },

  /** 获取指定仓库的状态 */
  getRepoState: (projectPath) => {
    return get().repoStates[projectPath] || makeEmptyRepoState();
  },

  /** 设置指定仓库的提交消息 */
  setRepoCommitMessage: (projectPath, msg) => {
    set((s) => {
      const prev = s.repoStates[projectPath] || makeEmptyRepoState();
      return {
        repoStates: {
          ...s.repoStates,
          [projectPath]: { ...prev, commitMessage: msg },
        },
        // 如果是当前活跃仓库，也同步扁平字段
        ...(s.activeRepoPath === projectPath ? { commitMessage: msg } : {}),
      };
    });
  },
}));

/** 浅比较 fileStatuses 数组：长度 + 每项 path/status/staged */
function _shallowEqualStatuses(a: GitFileStatus[], b: GitFileStatus[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].status !== b[i].status || a[i].staged !== b[i].staged) return false;
  }
  return true;
}

/** 浅比较 branchInfo */
function _shallowEqualBranch(a: GitBranchInfo | null, b: GitBranchInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.remote === b.remote && a.ahead === b.ahead && a.behind === b.behind && a.is_detached === b.is_detached;
}

/** Targeted refresh after stage/unstage/discard: only reload status + diffs (skip log & branchInfo) */
async function _refreshAfterFileOp(
  projectPath: string,
  set: (partial: Partial<GitState>) => void,
  get: () => GitState,
) {
  try {
    const [statuses, diff, diffStaged] = await Promise.all([
      ipc.gitStatus(projectPath),
      ipc.gitDiff(projectPath),
      ipc.gitDiffStaged(projectPath),
    ]);
    set({ fileStatuses: statuses, diffText: diff, diffStagedText: diffStaged });

    // 同步 status 到 repoStates
    const prev = get().repoStates[projectPath] || makeEmptyRepoState();
    set({ repoStates: { ...get().repoStates, [projectPath]: { ...prev, fileStatuses: statuses } } } as Partial<GitState>);

    const sel = get().selectedFile;
    if (sel) {
      const stillExists = statuses.some((f) => f.path === sel.path && f.staged === sel.staged);
      if (stillExists) {
        get().reloadSelectedFileDiff(projectPath);
      } else {
        set({ selectedFile: null, selectedFileDiff: "" });
      }
    }
  } catch {
    // fallback to full refresh on error
    get().refresh(projectPath);
  }
}
