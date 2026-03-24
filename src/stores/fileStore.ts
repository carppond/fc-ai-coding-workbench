import { create } from "zustand";
import type { DirEntry } from "../lib/types";
import * as ipc from "../ipc/commands";

/* ── 辅助：找到绝对路径所属的项目根 ── */
function findRootPath(trees: Record<string, DirEntry[]>, path: string): string | undefined {
  return Object.keys(trees).find((rp) => path === rp || path.startsWith(rp + "/"));
}

/* ── 辅助：在条目树中递归查找节点 ── */
function findNode(entries: DirEntry[], path: string): DirEntry | null {
  for (const e of entries) {
    if (e.path === path) return e;
    if (e.children) {
      const found = findNode(e.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** 递归替换 targetPath 节点的 children */
function updateChildren(
  entries: DirEntry[],
  targetPath: string,
  children: DirEntry[],
): DirEntry[] {
  return entries.map((e) => {
    if (e.path === targetPath) {
      return { ...e, children };
    }
    if (e.children && e.is_dir) {
      return { ...e, children: updateChildren(e.children, targetPath, children) };
    }
    return e;
  });
}

/* ── 辅助：更新 trees 中某棵树的条目 ── */
function patchTree(
  trees: Record<string, DirEntry[]>,
  rootPath: string,
  updater: (entries: DirEntry[]) => DirEntry[],
): Record<string, DirEntry[]> {
  const entries = trees[rootPath];
  if (!entries) return trees;
  return { ...trees, [rootPath]: updater(entries) };
}

interface FileState {
  trees: Record<string, DirEntry[]>; // projectPath → 根级条目
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  loading: boolean;
  currentProjectPaths: string[]; // 竞态保护

  // 文件编辑器状态
  openFilePath: string | null;
  openFileContent: string | null;
  openFileLine: number | null;
  openFileError: string | null;
  isDirty: boolean;
  saving: boolean;

  loadTree: (projectPath: string) => Promise<void>;
  loadTrees: (projectPaths: string[]) => Promise<void>;
  toggleExpand: (path: string) => void;
  refreshExpanded: (projectPath?: string) => Promise<void>;
  openFile: (filePath: string, line?: number) => Promise<void>;
  closeFile: () => void;
  markDirty: (dirty: boolean) => void;
  saveFile: (content: string) => Promise<boolean>;
  refreshParent: (parentPath: string) => Promise<void>;
  reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  trees: {},
  expandedPaths: new Set<string>(),
  loadingPaths: new Set<string>(),
  loading: false,
  currentProjectPaths: [],
  openFilePath: null,
  openFileContent: null,
  openFileLine: null,
  openFileError: null,
  isDirty: false,
  saving: false,

  /* ── 加载单棵项目树 ── */
  loadTree: async (projectPath: string) => {
    set((s) => ({ loading: true, currentProjectPaths: [projectPath], trees: { ...s.trees } }));
    try {
      const entries = await ipc.readDirectoryTree(projectPath, 1);
      // 竞态保护
      if (!get().currentProjectPaths.includes(projectPath)) return;
      set((s) => ({ trees: { ...s.trees, [projectPath]: entries }, loading: false }));
    } catch {
      if (!get().currentProjectPaths.includes(projectPath)) return;
      set((s) => ({ trees: { ...s.trees, [projectPath]: [] }, loading: false }));
    }
  },

  /* ── 并行加载多棵项目树 ── */
  loadTrees: async (projectPaths: string[]) => {
    if (projectPaths.length === 0) {
      set({ trees: {}, loading: false, currentProjectPaths: [] });
      return;
    }
    set({ loading: true, currentProjectPaths: projectPaths });
    try {
      const results = await Promise.all(
        projectPaths.map((p) => ipc.readDirectoryTree(p, 1).catch(() => [] as DirEntry[])),
      );
      // 竞态保护：检查路径列表是否已变
      const cur = get().currentProjectPaths;
      if (cur.length !== projectPaths.length || cur.some((p, i) => p !== projectPaths[i])) return;
      const trees: Record<string, DirEntry[]> = {};
      projectPaths.forEach((p, i) => { trees[p] = results[i]; });
      set({ trees, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  /* ── 展开/折叠目录 ── */
  toggleExpand: (path: string) => {
    const { expandedPaths, trees, loadingPaths } = get();
    const expanded = new Set(expandedPaths);

    if (expanded.has(path)) {
      expanded.delete(path);
      set({ expandedPaths: expanded });
      return;
    }

    expanded.add(path);
    set({ expandedPaths: expanded });

    // 找到该路径所属的项目根
    const rootPath = findRootPath(trees, path);
    if (!rootPath) return;

    // 检查 children 是否已加载
    const node = findNode(trees[rootPath], path);
    if (node && node.children && node.children.length > 0) return;

    // 懒加载 children
    if (loadingPaths.has(path)) return;
    const newLoading = new Set(loadingPaths);
    newLoading.add(path);
    set({ loadingPaths: newLoading });

    ipc.readDirectoryChildren(path).then((children) => {
      const { trees: curTrees, loadingPaths: curLoading } = get();
      const rp = findRootPath(curTrees, path);
      if (!rp) return;
      const updatedTrees = patchTree(curTrees, rp, (entries) =>
        updateChildren(entries, path, children),
      );
      const doneLoading = new Set(curLoading);
      doneLoading.delete(path);
      set({ trees: updatedTrees, loadingPaths: doneLoading });
    }).catch(() => {
      const { loadingPaths: curLoading } = get();
      const doneLoading = new Set(curLoading);
      doneLoading.delete(path);
      set({ loadingPaths: doneLoading });
    });
  },

  /* ── 刷新已展开的目录（可选指定项目，否则刷新所有） ── */
  refreshExpanded: async (projectPath?: string) => {
    const { expandedPaths, trees } = get();
    const rootPaths = projectPath ? [projectPath] : Object.keys(trees);

    for (const rp of rootPaths) {
      try {
        const rootEntries = await ipc.readDirectoryTree(rp, 1);
        let updatedEntries = rootEntries;

        // 刷新该项目下所有已展开的子目录
        for (const dirPath of expandedPaths) {
          if (dirPath === rp) continue;
          if (!dirPath.startsWith(rp + "/")) continue;
          try {
            const children = await ipc.readDirectoryChildren(dirPath);
            updatedEntries = updateChildren(updatedEntries, dirPath, children);
          } catch {
            const newExpanded = new Set(get().expandedPaths);
            newExpanded.delete(dirPath);
            set({ expandedPaths: newExpanded });
          }
        }

        set((s) => ({ trees: { ...s.trees, [rp]: updatedEntries } }));
      } catch {
        // ignore
      }
    }
  },

  /* ── 打开文件 ── */
  openFile: async (filePath: string, line?: number) => {
    set({ openFilePath: filePath, openFileContent: null, openFileLine: line ?? null, openFileError: null, isDirty: false });
    try {
      const content = await ipc.readFileContent(filePath);
      if (get().openFilePath === filePath) {
        set({ openFileContent: content });
      }
    } catch (err) {
      if (get().openFilePath === filePath) {
        const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
        set({ openFileError: msg });
      }
    }
  },

  closeFile: () => {
    set({ openFilePath: null, openFileContent: null, openFileLine: null, openFileError: null, isDirty: false });
  },

  markDirty: (dirty: boolean) => {
    set({ isDirty: dirty });
  },

  saveFile: async (content: string) => {
    const path = get().openFilePath;
    if (!path) return false;
    set({ saving: true });
    try {
      await ipc.writeFileContent(path, content);
      set({ openFileContent: content, isDirty: false, saving: false });
      return true;
    } catch {
      set({ saving: false });
      return false;
    }
  },

  /* ── 刷新父目录 ── */
  refreshParent: async (parentPath: string) => {
    try {
      const children = await ipc.readDirectoryChildren(parentPath);
      const { trees } = get();
      const rootPath = findRootPath(trees, parentPath);
      if (!rootPath) return;

      if (parentPath === rootPath) {
        // 刷新的是项目根
        set((s) => ({ trees: { ...s.trees, [rootPath]: children } }));
      } else {
        set((s) => ({
          trees: patchTree(s.trees, rootPath, (entries) =>
            updateChildren(entries, parentPath, children),
          ),
        }));
      }
    } catch {
      // ignore
    }
  },

  /* ── 重置 ── */
  reset: () => {
    set({
      trees: {},
      expandedPaths: new Set<string>(),
      loadingPaths: new Set<string>(),
      loading: false,
      currentProjectPaths: [],
      openFilePath: null,
      openFileContent: null,
      openFileLine: null,
      openFileError: null,
      isDirty: false,
      saving: false,
    });
  },
}));
