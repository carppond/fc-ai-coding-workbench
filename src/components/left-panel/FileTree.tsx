import { useEffect, useMemo } from "react";
import { FolderOpen, Loader } from "lucide-react";
import { useFileStore } from "../../stores/fileStore";
import { useProjectStore } from "../../stores/projectStore";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";
import { FileTreeItem } from "./FileTreeItem";
import type { DirEntry } from "../../lib/types";
import type { GitFileStatus } from "../../lib/types";

export function FileTree() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const selectedIds = useProjectStore((s) => s.selectedProjectIds);
  const projects = useProjectStore((s) => s.projects);
  const trees = useFileStore((s) => s.trees);
  const loading = useFileStore((s) => s.loading);
  const loadTrees = useFileStore((s) => s.loadTrees);
  const loadTree = useFileStore((s) => s.loadTree);
  const fileStatuses = useGitStore((s) => s.fileStatuses);
  const { t } = useI18n();

  // 勾选的项目列表
  const displayProjects = useMemo(
    () => projects.filter((p) => selectedIds.has(p.id)),
    [projects, selectedIds],
  );

  // 稳定的 key，防止引用变化导致无限 re-render
  const displayKey = useMemo(
    () => displayProjects.map((p) => p.id).join(","),
    [displayProjects],
  );

  useEffect(() => {
    if (displayProjects.length === 0) return;
    if (displayProjects.length === 1) {
      loadTree(displayProjects[0].path);
    } else {
      loadTrees(displayProjects.map((p) => p.path));
    }
  }, [displayKey]);

  // 构建 git 状态查找 Map（绝对路径 → GitFileStatus）和脏目录 Set
  const { gitStatusMap, gitDirtyDirs } = useMemo(() => {
    const map = new Map<string, GitFileStatus>();
    const dirs = new Set<string>();
    if (!activeProject) return { gitStatusMap: map, gitDirtyDirs: dirs };

    const projectPath = activeProject.path;
    for (const status of fileStatuses) {
      const absPath = projectPath + "/" + status.path;
      map.set(absPath, status);
      let parent = absPath;
      while (true) {
        const idx = parent.lastIndexOf("/");
        if (idx <= 0) break;
        parent = parent.substring(0, idx);
        if (parent.length <= projectPath.length) {
          dirs.add(parent);
          break;
        }
        dirs.add(parent);
      }
    }
    return { gitStatusMap: map, gitDirtyDirs: dirs };
  }, [activeProject, fileStatuses]);

  if (displayProjects.length === 0) {
    return (
      <div className="empty-state">
        <FolderOpen size={32} className="empty-state__icon" />
        <div className="empty-state__title">{t("leftPanel.noProjectOpen")}</div>
        <div className="empty-state__subtitle">{t("leftPanel.openProjectToStart")}</div>
      </div>
    );
  }

  if (loading && Object.keys(trees).length === 0) {
    return (
      <div className="empty-state">
        <Loader size={20} className="spin" />
        <div className="empty-state__subtitle">{t("loading")}</div>
      </div>
    );
  }

  const isMulti = displayProjects.length > 1;

  return (
    <div className="file-tree">
      <div className="file-tree__list">
        {displayProjects.map((proj) => {
          const entries = trees[proj.path] || [];
          const rootEntry: DirEntry = {
            name: proj.name,
            path: proj.path,
            is_dir: true,
            children: entries,
          };
          return (
            <FileTreeItem
              key={proj.path}
              entry={rootEntry}
              depth={0}
              defaultExpanded={!isMulti}
              isProjectRoot={isMulti}
              gitStatusMap={gitStatusMap}
              gitDirtyDirs={gitDirtyDirs}
            />
          );
        })}
      </div>
    </div>
  );
}
