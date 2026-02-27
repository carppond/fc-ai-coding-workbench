import { create } from "zustand";
import type { DirEntry } from "../lib/types";
import * as ipc from "../ipc/commands";

interface FileState {
  tree: DirEntry[];
  expandedPaths: Set<string>;
  loadingPaths: Set<string>; // directories currently being loaded
  loading: boolean;
  currentProjectPath: string | null;

  // File viewer/editor state
  openFilePath: string | null;
  openFileContent: string;
  openFileLine: number | null; // line to scroll to after opening
  isDirty: boolean;
  saving: boolean;

  loadTree: (projectPath: string) => Promise<void>;
  toggleExpand: (path: string) => void;
  refreshExpanded: (projectPath: string) => Promise<void>;
  openFile: (filePath: string, line?: number) => Promise<void>;
  closeFile: () => void;
  markDirty: (dirty: boolean) => void;
  saveFile: (content: string) => Promise<boolean>;
  refreshParent: (parentPath: string) => Promise<void>;
  reset: () => void;
}

/** Recursively replace children of the node at `targetPath` in the tree. */
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

export const useFileStore = create<FileState>((set, get) => ({
  tree: [],
  expandedPaths: new Set<string>(),
  loadingPaths: new Set<string>(),
  loading: false,
  currentProjectPath: null,
  openFilePath: null,
  openFileContent: "",
  openFileLine: null,
  isDirty: false,
  saving: false,

  loadTree: async (projectPath: string) => {
    set({ loading: true, currentProjectPath: projectPath });
    try {
      // Only load 1 level initially — children are loaded lazily on expand
      const tree = await ipc.readDirectoryTree(projectPath, 1);
      if (get().currentProjectPath !== projectPath) return;
      set({ tree, loading: false });
    } catch {
      if (get().currentProjectPath !== projectPath) return;
      set({ tree: [], loading: false });
    }
  },

  toggleExpand: (path: string) => {
    const { expandedPaths, tree, loadingPaths, currentProjectPath } = get();
    const expanded = new Set(expandedPaths);

    if (expanded.has(path)) {
      // Collapse
      expanded.delete(path);
      set({ expandedPaths: expanded });
      return;
    }

    // Expand
    expanded.add(path);
    set({ expandedPaths: expanded });

    // Check if children are already loaded (non-empty array means loaded)
    const node = findNode(tree, path);
    if (node && node.children && node.children.length > 0) {
      // Already loaded, nothing to do
      return;
    }

    // Need to lazy-load children
    if (loadingPaths.has(path)) return; // already loading
    if (!currentProjectPath) return;

    const newLoading = new Set(loadingPaths);
    newLoading.add(path);
    set({ loadingPaths: newLoading });

    ipc.readDirectoryChildren(path).then((children) => {
      const { tree: currentTree, loadingPaths: curLoading } = get();
      const updatedTree = updateChildren(currentTree, path, children);
      const doneLoading = new Set(curLoading);
      doneLoading.delete(path);
      set({ tree: updatedTree, loadingPaths: doneLoading });
    }).catch(() => {
      const { loadingPaths: curLoading } = get();
      const doneLoading = new Set(curLoading);
      doneLoading.delete(path);
      set({ loadingPaths: doneLoading });
    });
  },

  refreshExpanded: async (projectPath: string) => {
    const { expandedPaths } = get();
    try {
      // Reload root
      const tree = await ipc.readDirectoryTree(projectPath, 1);
      if (get().currentProjectPath !== projectPath) return;
      let updatedTree = tree;

      // Refresh all expanded directories
      for (const dirPath of expandedPaths) {
        if (dirPath === projectPath) continue;
        try {
          const children = await ipc.readDirectoryChildren(dirPath);
          updatedTree = updateChildren(updatedTree, dirPath, children);
        } catch {
          // Directory may have been deleted — remove from expanded
          const newExpanded = new Set(get().expandedPaths);
          newExpanded.delete(dirPath);
          set({ expandedPaths: newExpanded });
        }
      }
      set({ tree: updatedTree });
    } catch {
      // ignore
    }
  },

  openFile: async (filePath: string, line?: number) => {
    set({ openFilePath: filePath, openFileContent: "", openFileLine: line ?? null, isDirty: false });
    try {
      const content = await ipc.readFileContent(filePath);
      if (get().openFilePath === filePath) {
        set({ openFileContent: content });
      }
    } catch {
      if (get().openFilePath === filePath) {
        set({ openFileContent: "" });
      }
    }
  },

  closeFile: () => {
    set({ openFilePath: null, openFileContent: "", openFileLine: null, isDirty: false });
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

  refreshParent: async (parentPath: string) => {
    try {
      const children = await ipc.readDirectoryChildren(parentPath);
      const { tree: currentTree } = get();
      // Check if parentPath is the root project path
      if (parentPath === get().currentProjectPath) {
        set({ tree: children });
      } else {
        const updatedTree = updateChildren(currentTree, parentPath, children);
        set({ tree: updatedTree });
      }
    } catch {
      // ignore
    }
  },

  reset: () => {
    set({
      tree: [],
      expandedPaths: new Set<string>(),
      loadingPaths: new Set<string>(),
      loading: false,
      currentProjectPath: null,
      openFilePath: null,
      openFileContent: "",
      openFileLine: null,
      isDirty: false,
      saving: false,
    });
  },
}));

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
