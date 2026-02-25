import { create } from "zustand";
import type { Project } from "../lib/types";
import * as ipc from "../ipc/commands";
import { open } from "@tauri-apps/plugin-dialog";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  loadProjects: () => Promise<void>;
  openProject: () => Promise<void>;
  setActiveProject: (project: Project) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await ipc.listProjects();
      // Auto-restore the most recently opened project
      let active: Project | null = null;
      if (projects.length > 0) {
        active = projects.reduce((a, b) =>
          a.last_opened > b.last_opened ? a : b
        );
      }
      set({ projects, activeProject: active, loading: false });
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
      // Check if project already exists
      const existing = get().projects.find((p) => p.path === path);
      if (existing) {
        await get().setActiveProject(existing);
        return;
      }

      const project = await ipc.createProject(path, name);
      set((s) => ({ projects: [project, ...s.projects], activeProject: project }));
    } catch (e) {
      console.error("Failed to open project:", e);
    }
  },

  setActiveProject: async (project) => {
    await ipc.updateProjectLastOpened(project.id);
    set({ activeProject: project });
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
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProject: s.activeProject?.id === id ? null : s.activeProject,
    }));
  },
}));
