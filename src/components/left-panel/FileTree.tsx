import { useEffect, useMemo } from "react";
import { FolderOpen, Loader } from "lucide-react";
import { useFileStore } from "../../stores/fileStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { FileTreeItem } from "./FileTreeItem";
import type { DirEntry } from "../../lib/types";

export function FileTree() {
  const { activeProject } = useProjectStore();
  const { tree, loading, loadTree, reset } = useFileStore();
  const { t } = useI18n();

  useEffect(() => {
    if (activeProject) {
      loadTree(activeProject.path);
    } else {
      reset();
    }
  }, [activeProject?.id]);

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
        <FileTreeItem entry={rootEntry} depth={0} defaultExpanded />
      </div>
    </div>
  );
}
