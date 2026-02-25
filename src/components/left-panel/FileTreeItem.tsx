import { useEffect, useState, useRef } from "react";
import { ChevronRight, ChevronDown, Folder, FileText, Loader } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import type { DirEntry } from "../../lib/types";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";

interface FileTreeItemProps {
  entry: DirEntry;
  depth: number;
  defaultExpanded?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: DirEntry;
}

// Shared context menu state - only one menu open at a time
let globalCloseMenu: (() => void) | null = null;

export function FileTreeItem({ entry, depth, defaultExpanded }: FileTreeItemProps) {
  const { expandedPaths, toggleExpand, loadingPaths, openFile, refreshParent } = useFileStore();
  const { t } = useI18n();
  const isExpanded = expandedPaths.has(entry.path);
  const isLoading = loadingPaths.has(entry.path);
  const isDir = entry.is_dir;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editing, setEditing] = useState<"rename" | "newFile" | "newFolder" | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-expand on mount if defaultExpanded is set
  useEffect(() => {
    if (defaultExpanded && isDir && !expandedPaths.has(entry.path)) {
      toggleExpand(entry.path);
    }
  }, [entry.path]);

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (editing === "rename") {
        // Select name without extension for files
        const dotIdx = editValue.lastIndexOf(".");
        if (!isDir && dotIdx > 0) {
          inputRef.current.setSelectionRange(0, dotIdx);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    }
  }, [editing]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  const handleClick = () => {
    if (isDir) {
      toggleExpand(entry.path);
    } else {
      openFile(entry.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Close any other open menu
    if (globalCloseMenu) globalCloseMenu();
    // Clamp position so the menu doesn't overflow the window
    const menuW = 170;
    const menuH = isDir ? 200 : 120; // approximate menu height
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setContextMenu({ x, y, entry });
    globalCloseMenu = () => setContextMenu(null);
  };

  const getParentPath = (filePath: string) => {
    const parts = filePath.split("/");
    parts.pop();
    return parts.join("/");
  };

  const startRename = () => {
    setEditValue(entry.name);
    setEditing("rename");
    setContextMenu(null);
  };

  const startNewFile = () => {
    setEditValue("");
    setEditing("newFile");
    setContextMenu(null);
    // Ensure directory is expanded
    if (!isExpanded) toggleExpand(entry.path);
  };

  const startNewFolder = () => {
    setEditValue("");
    setEditing("newFolder");
    setContextMenu(null);
    if (!isExpanded) toggleExpand(entry.path);
  };

  const handleShowInFolder = () => {
    setContextMenu(null);
    ipc.showInFolder(entry.path);
  };

  const handleDelete = async () => {
    setContextMenu(null);
    const msg = t("fileTree.deleteConfirm").replace("{name}", entry.name);
    if (!(await ask(msg, { title: t("fileTree.delete"), kind: "warning" }))) return;
    try {
      await ipc.deleteEntry(entry.path);
      const parent = getParentPath(entry.path);
      refreshParent(parent);
    } catch {
      // ignore
    }
  };

  const commitEdit = async () => {
    const value = editValue.trim();
    if (!value) {
      setEditing(null);
      return;
    }

    try {
      if (editing === "rename") {
        const parent = getParentPath(entry.path);
        const newPath = parent + "/" + value;
        if (newPath !== entry.path) {
          await ipc.renameEntry(entry.path, newPath);
          refreshParent(parent);
        }
      } else if (editing === "newFile" || editing === "newFolder") {
        const newPath = entry.path + "/" + value;
        await ipc.createFileOrDir(newPath, editing === "newFolder");
        refreshParent(entry.path);
      }
    } catch {
      // ignore
    }
    setEditing(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  };

  return (
    <>
      <div
        className={`file-tree-item ${isDir ? "file-tree-item--dir" : "file-tree-item--file"}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {isDir ? (
          <span className="file-tree-item__chevron">
            {isLoading ? (
              <Loader size={14} className="spin" />
            ) : isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        ) : (
          <span className="file-tree-item__chevron" style={{ width: 14 }} />
        )}
        <span className="file-tree-item__icon">
          {isDir ? <Folder size={14} /> : <FileText size={14} />}
        </span>
        {editing === "rename" ? (
          <input
            ref={inputRef}
            className="file-tree-inline-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="file-tree-item__name">{entry.name}</span>
        )}
      </div>

      {/* Inline new file/folder input */}
      {isDir && isExpanded && (editing === "newFile" || editing === "newFolder") && (
        <div
          className="file-tree-item file-tree-item--file"
          style={{ paddingLeft: 12 + (depth + 1) * 16 }}
        >
          <span className="file-tree-item__chevron" style={{ width: 14 }} />
          <span className="file-tree-item__icon">
            {editing === "newFolder" ? <Folder size={14} /> : <FileText size={14} />}
          </span>
          <input
            ref={inputRef}
            className="file-tree-inline-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {isDir && isExpanded && entry.children && entry.children.map((child) => (
        <FileTreeItem key={child.path} entry={child} depth={depth + 1} />
      ))}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {isDir && (
            <>
              <div className="context-menu__item" onClick={startNewFile}>
                {t("fileTree.newFile")}
              </div>
              <div className="context-menu__item" onClick={startNewFolder}>
                {t("fileTree.newFolder")}
              </div>
            </>
          )}
          <div className="context-menu__item" onClick={startRename}>
            {t("fileTree.rename")}
          </div>
          <div className="context-menu__item" onClick={handleShowInFolder}>
            {t("fileTree.showInFolder")}
          </div>
          <div className="context-menu__separator" />
          <div className="context-menu__item context-menu__item--danger" onClick={handleDelete}>
            {t("fileTree.delete")}
          </div>
        </div>
      )}
    </>
  );
}
