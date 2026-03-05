import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FolderOpen, Pencil, Plus, RefreshCw, Trash2, Check, X } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { useConfirm } from "../common/ConfirmDialog";
import { FileTree } from "./FileTree";
import { FileSearchPanel } from "./FileSearchPanel";

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<"files" | "search">("files");
  const { projects, activeProject, setActiveProject, openProject, renameProject, deleteProject } =
    useProjectStore();
  const loadTree = useFileStore((s) => s.loadTree);
  const refreshExpanded = useFileStore((s) => s.refreshExpanded);
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const lastRefreshRef = useRef(0);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sort projects: active first, then by last_opened desc
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (a.id === activeProject?.id) return -1;
      if (b.id === activeProject?.id) return 1;
      return (b.last_opened ?? 0) - (a.last_opened ?? 0);
    });
  }, [projects, activeProject]);

  // Auto-refresh file tree on window focus (throttled 3s)
  const handleFocusRefresh = useCallback(() => {
    if (!activeProject) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 3000) return;
    lastRefreshRef.current = now;
    refreshExpanded(activeProject.path);
  }, [activeProject, refreshExpanded]);

  useEffect(() => {
    window.addEventListener("focus", handleFocusRefresh);
    return () => window.removeEventListener("focus", handleFocusRefresh);
  }, [handleFocusRefresh]);

  // Also refresh when switching to files tab
  useEffect(() => {
    if (activeTab === "files" && activeProject) {
      handleFocusRefresh();
    }
  }, [activeTab]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  const startRename = (proj: { id: string; name: string }) => {
    setRenamingId(proj.id);
    setRenameValue(proj.name);
  };

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    await renameProject(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  const handleDelete = async (projId: string, projName: string) => {
    const ok = await confirm({
      title: t("fileTree.delete"),
      message: t("fileTree.deleteConfirm").replace("{name}", projName),
      confirmLabel: t("confirm.delete"),
    });
    if (ok) await deleteProject(projId);
  };

  return (
    <div className="panel panel--left">
      <div className="panel__header">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === "files" ? "panel-tab--active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            {t("leftPanel.files")}
          </button>
          <button
            className={`panel-tab ${activeTab === "search" ? "panel-tab--active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            {t("leftPanel.search")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {activeTab === "files" && activeProject && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => loadTree(activeProject.path)}
              title={t("fileTree.refresh")}
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            className="btn btn--ghost btn--sm"
            onClick={openProject}
            title={t("topbar.openProject")}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Project list */}
      {sortedProjects.length > 0 && (
        <div className="project-list">
          {sortedProjects.map((proj) => {
            const isActive = proj.id === activeProject?.id;
            const isRenaming = renamingId === proj.id;

            return (
              <div
                key={proj.id}
                className={`project-item ${isActive ? "project-item--active" : ""}`}
                onClick={() => {
                  if (!isRenaming && !isActive) setActiveProject(proj);
                }}
                title={proj.path}
              >
                <FolderOpen size={13} />

                {isRenaming ? (
                  <>
                    <input
                      ref={renameInputRef}
                      className="project-item__rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="project-item__action"
                      onClick={(e) => { e.stopPropagation(); commitRename(); }}
                      title={t("confirm.cancel").replace(/.+/, "OK")}
                    >
                      <Check size={12} />
                    </button>
                    <button
                      className="project-item__action"
                      onClick={(e) => { e.stopPropagation(); cancelRename(); }}
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="project-item__name">{proj.name}</span>
                    {isActive && (
                      <span className="project-item__badge">
                        {t("git.workdir")}
                      </span>
                    )}
                    <div className="project-item__actions">
                      <button
                        className="project-item__action"
                        onClick={(e) => { e.stopPropagation(); startRename(proj); }}
                        title={t("fileTree.rename")}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="project-item__action project-item__action--danger"
                        onClick={(e) => { e.stopPropagation(); handleDelete(proj.id, proj.name); }}
                        title={t("fileTree.delete")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel__content">
        {activeTab === "files" ? (
          <FileTree />
        ) : (
          <FileSearchPanel />
        )}
      </div>

    </div>
  );
}
