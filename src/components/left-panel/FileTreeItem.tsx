import { useEffect, useState, useRef, memo } from "react";
import { ChevronRight, ChevronDown, Folder, FileText, Loader, FileCode, FileJson, Image, Terminal, Database, Lock, Package, Settings, BookOpen } from "lucide-react";
import type { DirEntry, GitFileStatus } from "../../lib/types";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { useConfirm } from "../common/ConfirmDialog";
import * as ipc from "../../ipc/commands";

interface FileTreeItemProps {
  entry: DirEntry;
  depth: number;
  defaultExpanded?: boolean;
  gitStatusMap?: Map<string, GitFileStatus>;
  gitDirtyDirs?: Set<string>;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: DirEntry;
}

// Shared context menu state - only one menu open at a time
let globalCloseMenu: (() => void) | null = null;

/** 根据文件名返回对应的图标和颜色 */
function getFileIcon(name: string): { icon: React.ReactNode; color: string } {
  const lower = name.toLowerCase();
  const ext = lower.split(".").pop() || "";

  // 特殊文件名
  if (lower === "package.json" || lower === "cargo.toml") return { icon: <Package size={14} />, color: "#e8ab53" };
  if (lower === "dockerfile" || lower.startsWith("docker-compose")) return { icon: <Package size={14} />, color: "#2496ed" };
  if (lower.startsWith(".env")) return { icon: <Lock size={14} />, color: "#ecd53f" };
  if (lower.startsWith(".git")) return { icon: <Settings size={14} />, color: "#f05033" };
  if (lower.endsWith(".lock") || lower === "yarn.lock") return { icon: <Lock size={14} />, color: "#8b8b8b" };
  if (lower.endsWith("config.js") || lower.endsWith("config.ts") || lower.endsWith(".config.mjs") || lower.endsWith("rc.json") || lower.endsWith("rc.js")) return { icon: <Settings size={14} />, color: "#8b8b8b" };

  switch (ext) {
    // JavaScript / TypeScript
    case "js": case "mjs": case "cjs": case "jsx": return { icon: <FileCode size={14} />, color: "#f1e05a" };
    case "ts": case "mts": case "cts": case "tsx": return { icon: <FileCode size={14} />, color: "#3178c6" };
    // Web
    case "html": case "htm": return { icon: <FileCode size={14} />, color: "#e44d26" };
    case "css": return { icon: <FileCode size={14} />, color: "#563d7c" };
    case "scss": case "sass": case "less": return { icon: <FileCode size={14} />, color: "#c6538c" };
    // Data
    case "json": case "jsonc": return { icon: <FileJson size={14} />, color: "#e8ab53" };
    case "yaml": case "yml": return { icon: <FileCode size={14} />, color: "#cb171e" };
    case "toml": return { icon: <FileCode size={14} />, color: "#9c4121" };
    case "xml": case "plist": case "storyboard": case "xib": return { icon: <FileCode size={14} />, color: "#e44d26" };
    case "sql": return { icon: <Database size={14} />, color: "#e38c00" };
    // Systems
    case "rs": return { icon: <FileCode size={14} />, color: "#dea584" };
    case "go": return { icon: <FileCode size={14} />, color: "#00add8" };
    case "py": case "pyw": return { icon: <FileCode size={14} />, color: "#3572a5" };
    case "rb": return { icon: <FileCode size={14} />, color: "#cc342d" };
    case "java": case "kt": case "kts": return { icon: <FileCode size={14} />, color: "#b07219" };
    case "c": case "h": return { icon: <FileCode size={14} />, color: "#555555" };
    case "cpp": case "cc": case "cxx": case "hpp": return { icon: <FileCode size={14} />, color: "#f34b7d" };
    case "m": case "mm": return { icon: <FileCode size={14} />, color: "#438eff" };
    case "swift": return { icon: <FileCode size={14} />, color: "#f05138" };
    case "php": return { icon: <FileCode size={14} />, color: "#4f5d95" };
    // Shell
    case "sh": case "bash": case "zsh": case "fish": return { icon: <Terminal size={14} />, color: "#89e051" };
    // Docs
    case "md": case "mdx": return { icon: <BookOpen size={14} />, color: "#519aba" };
    case "txt": case "log": return { icon: <FileText size={14} />, color: "#8b8b8b" };
    // Images
    case "png": case "jpg": case "jpeg": case "gif": case "svg": case "ico": case "webp": case "bmp": return { icon: <Image size={14} />, color: "#a074c4" };
    // Default
    default: return { icon: <FileText size={14} />, color: "var(--text-muted)" };
  }
}

/** 状态字母映射 */
function statusLetter(status: string): string {
  switch (status) {
    case "added": return "A";
    case "modified": return "M";
    case "deleted": return "D";
    case "untracked": return "?";
    case "renamed": return "R";
    default: return "?";
  }
}

/** 状态对应的 CSS 修饰符 */
function statusClass(status: string): string {
  switch (status) {
    case "modified": case "renamed": return "modified";
    case "added": case "untracked": return "added";
    case "deleted": return "deleted";
    default: return "modified";
  }
}

export const FileTreeItem = memo(function FileTreeItem({ entry, depth, defaultExpanded, gitStatusMap, gitDirtyDirs }: FileTreeItemProps) {
  const expandedPaths = useFileStore((s) => s.expandedPaths);
  const toggleExpand = useFileStore((s) => s.toggleExpand);
  const loadingPaths = useFileStore((s) => s.loadingPaths);
  const openFile = useFileStore((s) => s.openFile);
  const refreshParent = useFileStore((s) => s.refreshParent);
  const { t } = useI18n();
  const { confirm } = useConfirm();
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
    if (!(await confirm({ title: t("fileTree.delete"), message: msg, confirmLabel: t("confirm.delete") }))) return;
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
        <span className="file-tree-item__icon" style={isDir ? undefined : { color: getFileIcon(entry.name).color }}>
          {isDir ? <Folder size={14} /> : getFileIcon(entry.name).icon}
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
        ) : (() => {
          const fileStatus = gitStatusMap?.get(entry.path);
          const hasDirtyChildren = isDir && gitDirtyDirs?.has(entry.path);
          const nameClass = fileStatus
            ? `file-tree-item__name file-tree-item__name--${statusClass(fileStatus.status)}`
            : hasDirtyChildren
              ? "file-tree-item__name file-tree-item__name--has-changes"
              : "file-tree-item__name";
          return (
            <>
              <span className={nameClass}>{entry.name}</span>
              {fileStatus && (
                <span className={`file-tree-item__git-status file-tree-item__name--${statusClass(fileStatus.status)}`}>
                  {statusLetter(fileStatus.status)}
                </span>
              )}
            </>
          );
        })()}
      </div>

      {/* Inline new file/folder input */}
      {isDir && isExpanded && (editing === "newFile" || editing === "newFolder") && (
        <div
          className="file-tree-item file-tree-item--file"
          style={{ paddingLeft: 12 + (depth + 1) * 16 }}
        >
          <span className="file-tree-item__chevron" style={{ width: 14 }} />
          <span className="file-tree-item__icon">
            {editing === "newFolder" ? <Folder size={14} /> : <FileCode size={14} />}
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
        <FileTreeItem key={child.path} entry={child} depth={depth + 1} gitStatusMap={gitStatusMap} gitDirtyDirs={gitDirtyDirs} />
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
});
