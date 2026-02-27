import { create } from "zustand";
import type { GitFileStatus, GitBranchInfo, GitLogEntry, BranchListItem } from "../lib/types";
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

interface GitState {
  fileStatuses: GitFileStatus[];
  branchInfo: GitBranchInfo | null;
  logEntries: GitLogEntry[];
  branches: BranchListItem[];
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
}

// Cancellation controller for refresh — only the latest refresh applies
let refreshController: AbortController | null = null;

export const useGitStore = create<GitState>((set, get) => ({
  fileStatuses: [],
  branchInfo: null,
  logEntries: [],
  branches: [],
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

    await Promise.all([loadDiff(), loadDiffStaged(), loadLog()]);

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

    set({ fileStatuses: statuses, branchInfo: branch, isGitRepo });
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
    const msg = get().commitMessage.trim();
    if (!msg) return false;
    if (get().operating) return false;
    set({ operating: true, operationType: "commit", error: null });
    try {
      await ipc.gitCommit(projectPath, msg);
      set({ commitMessage: "", selectedFile: null, selectedFileDiff: "", operating: false, operationType: null });
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
    });
  },
}));

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
