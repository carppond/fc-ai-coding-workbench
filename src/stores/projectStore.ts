import { create } from "zustand";
import type { Project } from "../lib/types";
import * as ipc from "../ipc/commands";
import { open } from "@tauri-apps/plugin-dialog";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  gitContextPath: string | null; // 右侧源代码管理当前操作的项目路径（文件树点击切换，不影响终端）
  selectedProjectIds: Set<string>; // 勾选的项目，同时显示在文件树和 Git 面板
  loading: boolean;

  loadProjects: () => Promise<void>;
  openProject: () => Promise<void>;
  setActiveProject: (project: Project) => Promise<void>;
  setGitContext: (projectPath: string) => void; // 只切换源代码管理上下文，不影响终端
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  toggleProjectSelected: (id: string) => void;
  /** 源代码管理使用的有效路径：gitContextPath 优先，fallback 到 activeProject.path */
  getGitEffectivePath: () => string | null;
}

/* ── 持久化 selectedProjectIds ── */
async function saveSelectedIds(ids: Set<string>) {
  try {
    await ipc.setSetting("selected_project_ids", [...ids]);
  } catch { /* ignore */ }
}

async function loadSelectedIds(): Promise<string[]> {
  try {
    const val = await ipc.getSetting("selected_project_ids");
    if (Array.isArray(val)) return val as string[];
  } catch { /* ignore */ }
  return [];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  gitContextPath: null,
  selectedProjectIds: new Set<string>(),
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const [projects, savedIds] = await Promise.all([
        ipc.listProjects(),
        loadSelectedIds(),
      ]);

      // 过滤掉已删除的项目 ID
      const validIds = savedIds.filter((id) => projects.some((p) => p.id === id));
      const selectedProjectIds = new Set<string>(validIds);

      // 恢复 activeProject：MRU
      let active: Project | null = null;
      if (projects.length > 0) {
        active = projects.reduce((a, b) =>
          a.last_opened > b.last_opened ? a : b
        );
        // 确保 activeProject 在 selectedProjectIds 中
        if (active && selectedProjectIds.size > 0 && !selectedProjectIds.has(active.id)) {
          active = projects.find((p) => selectedProjectIds.has(p.id)) || active;
        }
        // 如果没有任何 selected，默认选中 active
        if (selectedProjectIds.size === 0 && active) {
          selectedProjectIds.add(active.id);
        }
      }

      set({ projects, activeProject: active, selectedProjectIds, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  openProject: async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    const path = selected as string;
    const name = path.split("/").pop() || path.split("\\").pop() || path;

    try {
      let project = get().projects.find((p) => p.path === path);
      if (project) {
        await get().setActiveProject(project);
      } else {
        project = await ipc.createProject(path, name);
        set((s) => ({ projects: [project!, ...s.projects], activeProject: project! }));
      }

      // 自动勾选新打开的项目
      if (project) {
        const ids = new Set(get().selectedProjectIds);
        if (!ids.has(project.id)) {
          ids.add(project.id);
          set({ selectedProjectIds: ids });
          saveSelectedIds(ids);
        }
      }
    } catch (e) {
      console.error("Failed to open project:", e);
    }
  },

  setActiveProject: async (project) => {
    await ipc.updateProjectLastOpened(project.id);
    // 切换 activeProject 时同步 gitContextPath（终端 + 源代码管理一起切）
    set({ activeProject: project, gitContextPath: project.path });
  },

  setGitContext: (projectPath) => {
    set({ gitContextPath: projectPath });
  },

  renameProject: async (id, name) => {
    await ipc.renameProject(id, name);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
      activeProject:
        s.activeProject?.id === id
          ? { ...s.activeProject, name }
          : s.activeProject,
    }));
  },

  deleteProject: async (id) => {
    await ipc.deleteProject(id);
    const ids = new Set(get().selectedProjectIds);
    ids.delete(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProject: s.activeProject?.id === id ? null : s.activeProject,
      selectedProjectIds: ids,
    }));
    saveSelectedIds(ids);
  },

  toggleProjectSelected: (id) => {
    const ids = new Set(get().selectedProjectIds);
    if (ids.has(id)) {
      // 至少保留一个勾选
      if (ids.size <= 1) return;
      ids.delete(id);
      // 如果取消的是 activeProject，切换到其他勾选项目
      if (get().activeProject?.id === id) {
        const nextId = [...ids][0];
        const next = get().projects.find((p) => p.id === nextId);
        if (next) {
          set({ activeProject: next });
          ipc.updateProjectLastOpened(next.id);
        }
      }
    } else {
      ids.add(id);
    }
    set({ selectedProjectIds: ids });
    saveSelectedIds(ids);
  },

  getGitEffectivePath: () => {
    const { gitContextPath, activeProject } = get();
    return gitContextPath ?? activeProject?.path ?? null;
  },
}));
