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
  const { activeProject } = useProjectStore();
  const { tree, loading, loadTree, reset } = useFileStore();
  const fileStatuses = useGitStore((s) => s.fileStatuses);
  const { t } = useI18n();

  useEffect(() => {
    if (activeProject) {
      loadTree(activeProject.path);
    } else {
      reset();
    }
  }, [activeProject?.id]);

  // 构建 git 状态查找 Map（绝对路径 → GitFileStatus）和脏目录 Set
  const { gitStatusMap, gitDirtyDirs } = useMemo(() => {
    const map = new Map<string, GitFileStatus>();
    const dirs = new Set<string>();
    if (!activeProject) return { gitStatusMap: map, gitDirtyDirs: dirs };

    const projectPath = activeProject.path;
    for (const status of fileStatuses) {
      const absPath = projectPath + "/" + status.path;
      map.set(absPath, status);
      // 向上递推所有父目录
      let parent = absPath;
      while (true) {
        const idx = parent.lastIndexOf("/");
        if (idx <= 0) break;
        parent = parent.substring(0, idx);
        if (parent.length <= projectPath.length) {
          // 项目根目录也加入
          dirs.add(parent);
          break;
        }
        dirs.add(parent);
      }
    }
    return { gitStatusMap: map, gitDirtyDirs: dirs };
  }, [activeProject, fileStatuses]);

  // Wrap tree data in a root node representing the project directory
  const rootEntry = useMemo<DirEntry | null>(() => {
    if (!activeProject) return null;
    return {
      name: activeProject.name,
      path: activeProject.path,
      is_dir: true,
      children: tree,
    };
  }, [activeProject, tree]);

  if (!activeProject) {
    return (
      <div className="empty-state">
        <FolderOpen size={32} className="empty-state__icon" />
        <div className="empty-state__title">{t("leftPanel.noProjectOpen")}</div>
        <div className="empty-state__subtitle">{t("leftPanel.openProjectToStart")}</div>
      </div>
    );
  }

  if (loading && tree.length === 0) {
    return (
      <div className="empty-state">
        <Loader size={20} className="spin" />
        <div className="empty-state__subtitle">{t("loading")}</div>
      </div>
    );
  }

  if (!rootEntry) return null;

  return (
    <div className="file-tree">
      <div className="file-tree__list">
        <FileTreeItem
          entry={rootEntry}
          depth={0}
          defaultExpanded
          gitStatusMap={gitStatusMap}
          gitDirtyDirs={gitDirtyDirs}
        />
      </div>
    </div>
  );
}
