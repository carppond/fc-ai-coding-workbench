import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, RotateCw, Sparkles } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { Terminal } from "./Terminal";
import { FileViewer } from "./FileViewer";
import { useConfirm } from "../common/ConfirmDialog";
import * as ipc from "../../ipc/commands";
import {
  LayoutNode, LayoutLeaf,
  countLeaves, splitLeaf, removeLeaf,
  updateLeafAlive, replaceLeaf, findLeafCwd, isLeafAlive,
  findLinkedSplit, updateRatio,
} from "./layoutTree";

/* ── 数据结构 ────────────────────────────────────────── */

interface TerminalTab {
  id: string;
  title: string;
  layout: LayoutNode;
}

const MAX_TABS = 5;
const MAX_PANES_PER_TAB = 4;

let tabCounter = 0;
function nextTabId(): string {
  tabCounter += 1;
  return `tab-${tabCounter}`;
}
let paneCounter = 0;
function nextPaneId(): string {
  paneCounter += 1;
  return `pane-${paneCounter}`;
}

function makeTab(title: string, cwd?: string): TerminalTab {
  const id = nextTabId();
  const leaf: LayoutLeaf = { type: "leaf", paneId: nextPaneId(), alive: true, cwd };
  return { id, title, layout: leaf };
}

/* ── 右键菜单状态类型 ────────────────────────────────── */

interface ContextMenuPos {
  x: number;
  y: number;
}
interface TabContextMenu extends ContextMenuPos {
  tabId: string;
}

/* ── 检查 layout 中是否有任何存活的 pane ── */
function hasAliveLeaf(node: LayoutNode): boolean {
  if (node.type === "leaf") return node.alive;
  return hasAliveLeaf(node.children[0]) || hasAliveLeaf(node.children[1]);
}

/* ── 获取第一个叶子的 paneId ── */
function firstPaneId(node: LayoutNode): string {
  if (node.type === "leaf") return node.paneId;
  return firstPaneId(node.children[0]);
}

/* ── 组件 ─────────────────────────────────────────────── */

export function CenterPanel() {
  const { activeProject } = useProjectStore();
  const openFilePath = useFileStore((s) => s.openFilePath);
  const closeFile = useFileStore((s) => s.closeFile);
  const isDirty = useFileStore((s) => s.isDirty);
  const { t } = useI18n();
  const { confirm } = useConfirm();

  // Tab 管理
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [makeTab("Terminal 1")]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const tabCounterRef = useRef(1);

  // 焦点 pane 追踪（state 仅驱动 header 高亮重绘）
  const activePaneIdRef = useRef<Map<string, string>>(new Map());
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  // 右键菜单
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const [addMenuPos, setAddMenuPos] = useState<ContextMenuPos | null>(null);

  // 双击重命名
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const tabInputRef = useRef<HTMLInputElement>(null);

  const activeTab = openFilePath ? "file" : "terminal";
  const projectPath = activeProject?.path ?? null;
  const projectId = activeProject?.id ?? null;

  // split DOM 元素 ref（用于拖拽时直接操作 DOM flex）
  const splitDomRef = useRef<Map<string, HTMLDivElement>>(new Map());

  /* ── pane 级别的 session/focus 映射（key = paneId）── */
  const sessionMapRef = useRef<Map<string, string>>(new Map());
  const focusMapRef = useRef<Map<string, () => void>>(new Map());

  const handlePaneSessionReady = useCallback((paneId: string, sessionId: string | null) => {
    if (sessionId) sessionMapRef.current.set(paneId, sessionId);
    else sessionMapRef.current.delete(paneId);
  }, []);

  const handlePaneFocusReady = useCallback((paneId: string, focusFn: () => void) => {
    focusMapRef.current.set(paneId, focusFn);
  }, []);

  /* ── 获取 tab 的活跃 pane ── */
  const getActivePaneId = useCallback((tab: TerminalTab): string => {
    return activePaneIdRef.current.get(tab.id) || firstPaneId(tab.layout);
  }, []);

  /* ── 项目切换重置 ── */
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (projectId !== null && prevProjectIdRef.current !== null && projectId !== prevProjectIdRef.current) {
      tabCounterRef.current = 1;
      const tab = makeTab("Terminal 1");
      setTabs([tab]);
      setActiveTabId(tab.id);
      activePaneIdRef.current.clear();
      setFocusedPaneId(null);
    }
    prevProjectIdRef.current = projectId;
  }, [projectId]);

  /* ── 右键菜单 click-outside dismiss ── */
  useEffect(() => {
    if (!tabContextMenu && !addMenuPos) return;
    const handler = () => { setTabContextMenu(null); setAddMenuPos(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [tabContextMenu, addMenuPos]);

  /* ── Pane alive 变化 ── */
  const handlePaneAliveChange = useCallback((tabId: string, paneId: string, alive: boolean) => {
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      const newLayout = updateLeafAlive(tab.layout, paneId, alive);
      if (newLayout === tab.layout) return tab;
      return { ...tab, layout: newLayout };
    }));
  }, []);

  /* ── 新建 Tab ── */
  const handleAddTab = useCallback((cwd?: string) => {
    if (openFilePath) closeFile();
    tabCounterRef.current += 1;
    const title = cwd ? cwd.split("/").pop() || cwd : `Terminal ${tabCounterRef.current}`;
    const tab = makeTab(title, cwd);
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, [openFilePath, closeFile]);

  /* ── 右键 + 选择目录新建 ── */
  const handleAddTabWithDir = useCallback(async () => {
    setAddMenuPos(null);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      handleAddTab(selected as string);
    } catch {
      // 用户取消或对话框失败
    }
  }, [handleAddTab]);

  /* ── 关闭 Tab ── */
  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      setActiveTabId((cur) => {
        if (cur !== tabId) return cur;
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx]?.id ?? next[0]?.id ?? cur;
      });
      return next;
    });
    activePaneIdRef.current.delete(tabId);
  }, []);

  /* ── 关闭 Pane（二叉树版）── */
  const handleClosePane = useCallback((tabId: string, paneId: string) => {
    // 清理旧 pane 的 session/focus 映射
    sessionMapRef.current.delete(paneId);
    focusMapRef.current.delete(paneId);
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      if (!tab) return prev;
      const newLayout = removeLeaf(tab.layout, paneId);
      if (newLayout === null) {
        // 最后一个 pane → 关闭 tab
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        setActiveTabId((cur) => {
          if (cur !== tabId) return cur;
          const newIdx = Math.min(idx, next.length - 1);
          return next[newIdx]?.id ?? cur;
        });
        activePaneIdRef.current.delete(tabId);
        return next;
      }
      // 更新焦点 pane
      const curFocus = activePaneIdRef.current.get(tabId);
      if (curFocus === paneId) {
        const firstId = firstPaneId(newLayout);
        activePaneIdRef.current.set(tabId, firstId);
        setFocusedPaneId(firstId);
      }
      return prev.map((t) => t.id !== tabId ? t : { ...t, layout: newLayout });
    });
  }, []);

  /* ── 分屏（二叉树版）── */
  const handleSplitPane = useCallback((tabId: string, paneId: string, direction: "horizontal" | "vertical") => {
    setTabContextMenu(null);
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      if (countLeaves(tab.layout) >= MAX_PANES_PER_TAB) return tab;
      const sourceCwd = findLeafCwd(tab.layout, paneId);
      const newPaneId = nextPaneId();
      const newLayout = splitLeaf(tab.layout, paneId, direction, newPaneId, sourceCwd);
      if (newLayout === tab.layout) return tab;
      return { ...tab, layout: newLayout };
    }));
  }, []);

  /* ── Cmd+W / Ctrl+W 关闭当前面板 ── */
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "w" && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        if (activeTab === "file") {
          if (isDirty) {
            confirm({
              message: t("fileViewer.unsavedChanges"),
              confirmLabel: t("fileViewer.dontSave"),
              cancelLabel: t("confirm.cancel"),
            }).then((result) => { if (result) closeFile(); });
          } else {
            closeFile();
          }
        } else {
          const curTab = tabs.find((tab) => tab.id === activeTabId);
          if (!curTab) return;
          const paneId = activePaneIdRef.current.get(activeTabId) || firstPaneId(curTab.layout);
          if (paneId) handleClosePane(activeTabId, paneId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, activeTabId, tabs, isDirty, closeFile, confirm, t, handleClosePane]);

  /* ── Pane 焦点 ── */
  const handlePaneFocus = useCallback((tabId: string, paneId: string) => {
    activePaneIdRef.current.set(tabId, paneId);
    setFocusedPaneId(paneId);
  }, []);

  /* ── 双击重命名 ── */
  const startTabRename = useCallback((tabId: string) => {
    setTabContextMenu(null);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setEditValue(tab.title);
    setEditingTabId(tabId);
    requestAnimationFrame(() => {
      tabInputRef.current?.focus();
      tabInputRef.current?.select();
    });
  }, [tabs]);

  const commitTabRename = useCallback((tabId: string) => {
    const val = editValue.trim();
    setEditingTabId(null);
    if (!val) return;
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, title: val } : tab)));
  }, [editValue]);

  /* ── 在当前活跃终端启动 Claude Code ── */
  const handleLaunchClaude = useCallback(async () => {
    if (openFilePath) closeFile();
    const curTab = tabs.find((t) => t.id === activeTabId);
    if (!curTab) return;
    const paneId = getActivePaneId(curTab);
    if (!isLeafAlive(curTab.layout, paneId)) return;

    const sessionId = sessionMapRef.current.get(paneId);
    if (!sessionId) return;

    try {
      const idle = await ipc.isTerminalIdle(sessionId);
      if (!idle) {
        focusMapRef.current.get(paneId)?.();
        return;
      }
    } catch { /* 检查失败时仍允许执行 */ }

    ipc.writeTerminal(sessionId, "claude\r");
    requestAnimationFrame(() => { focusMapRef.current.get(paneId)?.(); });
  }, [activeTabId, tabs, openFilePath, closeFile, getActivePaneId]);

  /* ── 重启 Pane（二叉树版）── */
  const handleRestartPane = useCallback((tabId: string, paneId: string) => {
    const newId = nextPaneId();
    // 更新 activePaneIdRef
    if (activePaneIdRef.current.get(tabId) === paneId) {
      activePaneIdRef.current.set(tabId, newId);
    }
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      const newLayout = replaceLeaf(tab.layout, paneId, newId);
      if (newLayout === tab.layout) return tab;
      return { ...tab, layout: newLayout };
    }));
  }, []);

  /* ── 分割线拖拽（二叉树版）── */
  const handleDividerDrag = useCallback((e: React.MouseEvent, splitId: string, vertical: boolean, tabLayout: LayoutNode) => {
    e.preventDefault();
    const container = splitDomRef.current.get(splitId);
    if (!container) return;
    const child1 = container.children[0] as HTMLElement;
    const child2 = container.children[2] as HTMLElement; // [0]=child1, [1]=handle, [2]=child2
    if (!child1 || !child2) return;

    // 4-pane 联动检测
    const linkedSplitId = findLinkedSplit(tabLayout, splitId);
    let linkedChild1: HTMLElement | null = null;
    let linkedChild2: HTMLElement | null = null;
    if (linkedSplitId) {
      const linkedContainer = splitDomRef.current.get(linkedSplitId);
      if (linkedContainer) {
        linkedChild1 = linkedContainer.children[0] as HTMLElement;
        linkedChild2 = linkedContainer.children[2] as HTMLElement;
      }
    }

    const startPos = vertical ? e.clientY : e.clientX;
    const size1 = vertical ? child1.offsetHeight : child1.offsetWidth;
    const size2 = vertical ? child2.offsetHeight : child2.offsetWidth;
    const total = size1 + size2;

    const onMove = (ev: MouseEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      const newSize1 = Math.max(60, Math.min(total - 60, size1 + delta));
      const ratio = newSize1 / total;
      child1.style.flex = String(ratio);
      child2.style.flex = String(1 - ratio);
      // 联动
      if (linkedChild1 && linkedChild2) {
        linkedChild1.style.flex = String(ratio);
        linkedChild2.style.flex = String(1 - ratio);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // 将最终 ratio 写入 state
      const finalSize1 = vertical ? child1.offsetHeight : child1.offsetWidth;
      const finalSize2 = vertical ? child2.offsetHeight : child2.offsetWidth;
      const finalTotal = finalSize1 + finalSize2;
      if (finalTotal > 0) {
        const finalRatio = finalSize1 / finalTotal;
        setTabs((prev) => prev.map((tab) => {
          let newLayout = updateRatio(tab.layout, splitId, finalRatio);
          if (linkedSplitId) {
            newLayout = updateRatio(newLayout, linkedSplitId, finalRatio);
          }
          if (newLayout === tab.layout) return tab;
          return { ...tab, layout: newLayout };
        }));
      }
    };
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  /* ── 右键菜单定位工具 ── */
  const clampMenu = (e: React.MouseEvent, w: number, h: number): ContextMenuPos => ({
    x: Math.min(e.clientX, window.innerWidth - w - 8),
    y: Math.min(e.clientY, window.innerHeight - h - 8),
  });

  /* ── 递归渲染布局树 ── */
  const renderLayout = useCallback((
    node: LayoutNode,
    tabId: string,
    isActive: boolean,
    showPaneHeader: boolean,
    tabLayout: LayoutNode,
  ): React.ReactNode => {
    if (node.type === "leaf") {
      const isFocused = focusedPaneId === node.paneId
        || (!activePaneIdRef.current.has(tabId) && node.paneId === firstPaneId(tabLayout));
      return (
        <div
          key={node.paneId}
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
          onClick={showPaneHeader ? () => handlePaneFocus(tabId, node.paneId) : undefined}
        >
          {/* Pane header — 仅多 pane 时显示 */}
          {showPaneHeader && (
            <div className={`pane-header ${isFocused ? "pane-header--active" : ""}`}>
              <span className="pane-header__title">
                {node.cwd ? node.cwd.split("/").pop() : "Terminal"}
              </span>
              <span
                className="pane-header__close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClosePane(tabId, node.paneId);
                }}
              >
                <X size={11} />
              </span>
            </div>
          )}
          {/* Terminal */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <Terminal
              key={node.paneId}
              projectPath={projectPath}
              cwd={node.cwd}
              onAliveChange={(alive) => handlePaneAliveChange(tabId, node.paneId, alive)}
              onSessionReady={(sid) => handlePaneSessionReady(node.paneId, sid)}
              onFocusReady={(fn) => handlePaneFocusReady(node.paneId, fn)}
              visible={isActive}
            />
            {/* 退出覆盖层 */}
            {isActive && !node.alive && (
              <div className={showPaneHeader ? "pane-exited-overlay" : "terminal-exited-overlay"}
                style={showPaneHeader ? { position: "absolute", bottom: 0, left: 0, right: 0 } : undefined}
              >
                <span>{t("terminal.exited")}</span>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => handleRestartPane(tabId, node.paneId)}
                >
                  <RotateCw size={13} />
                  {t("terminal.restart")}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Split 节点：flex 容器 + 分割线
    const isVertical = node.direction === "vertical";
    return (
      <div
        key={node.id}
        ref={(el) => {
          if (el) splitDomRef.current.set(node.id, el);
          else splitDomRef.current.delete(node.id);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
        }}
      >
        <div style={{ flex: node.ratio, minWidth: 0, minHeight: 0, display: "flex", flexDirection: isVertical ? "column" : "row" }}>
          {renderLayout(node.children[0], tabId, isActive, showPaneHeader, tabLayout)}
        </div>
        <div
          className={`pane-resize-handle ${isVertical ? "pane-resize-handle--vertical" : ""}`}
          onMouseDown={(e) => handleDividerDrag(e, node.id, isVertical, tabLayout)}
        />
        <div style={{ flex: 1 - node.ratio, minWidth: 0, minHeight: 0, display: "flex", flexDirection: isVertical ? "column" : "row" }}>
          {renderLayout(node.children[1], tabId, isActive, showPaneHeader, tabLayout)}
        </div>
      </div>
    );
  }, [focusedPaneId, projectPath, t, handlePaneFocus, handleClosePane, handlePaneAliveChange,
      handlePaneSessionReady, handlePaneFocusReady, handleRestartPane, handleDividerDrag]);

  /* ── 渲染 ── */
  return (
    <div className="panel" style={{ background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div className="center-panel-tabs">
        {/* Terminal tabs */}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`panel-tab ${activeTab === "terminal" && activeTabId === tab.id ? "panel-tab--active" : ""}`}
            onClick={() => {
              if (openFilePath) closeFile();
              setActiveTabId(tab.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAddMenuPos(null);
              setTabContextMenu({ ...clampMenu(e, 170, 160), tabId: tab.id });
            }}
            title={t("terminal.tooltipRename")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startTabRename(tab.id);
            }}
          >
            <span
              className="panel-tab__label"
              style={{ opacity: hasAliveLeaf(tab.layout) ? 1 : 0.5 }}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={tabInputRef}
                  className="panel-tab__rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitTabRename(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTabRename(tab.id);
                    if (e.key === "Escape") setEditingTabId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                tab.title
              )}
            </span>
            {tabs.length > 1 && (
              <span
                className="panel-tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
              >
                <X size={12} />
              </span>
            )}
          </button>
        ))}

        {/* Add tab button */}
        {tabs.length < MAX_TABS && (
          <button
            className="panel-tab panel-tab--add"
            onClick={() => handleAddTab()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTabContextMenu(null);
              setAddMenuPos(clampMenu(e, 200, 70));
            }}
            title={t("terminal.tooltipNew")}
          >
            <Plus size={14} />
          </button>
        )}

        {/* File tab (when a file is open) */}
        {openFilePath && (
          <button
            className="panel-tab panel-tab--active"
            style={{ maxWidth: 200, display: "flex", alignItems: "center", gap: 6 }}
          >
            {isDirty && <span className="panel-tab__dirty-dot" />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {openFilePath.split("/").pop()}
            </span>
            <span
              className="panel-tab__close"
              onClick={async (e) => {
                e.stopPropagation();
                if (isDirty) {
                  const result = await confirm({
                    message: t("fileViewer.unsavedChanges"),
                    confirmLabel: t("fileViewer.dontSave"),
                    cancelLabel: t("confirm.cancel"),
                  });
                  if (result) closeFile();
                } else {
                  closeFile();
                }
              }}
            >
              <X size={12} />
            </span>
          </button>
        )}

        {/* Spacer + Launch Claude Code button */}
        <div style={{ flex: 1 }} />
        <button
          className="cc-launch-btn"
          onClick={handleLaunchClaude}
          title={t("terminal.launchCC")}
        >
          <Sparkles size={13} />
          <span>{t("terminal.launchCC")}</span>
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* File viewer */}
        {openFilePath && (
          <div style={{ width: "100%", height: "100%", display: activeTab === "file" ? "block" : "none" }}>
            <FileViewer />
          </div>
        )}

        {/* Terminal panes — 二叉树递归布局 */}
        <div style={{ width: "100%", height: "100%", display: activeTab === "terminal" ? "block" : "none" }}>
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id && activeTab === "terminal";
            const showPaneHeader = countLeaves(tab.layout) > 1;

            return (
              <div
                key={tab.id}
                style={{
                  width: "100%", height: "100%",
                  display: isActive ? "flex" : "none",
                }}
              >
                {renderLayout(tab.layout, tab.id, isActive, showPaneHeader, tab.layout)}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tab 右键菜单 ── */}
      {tabContextMenu && (() => {
        const tab = tabs.find((t) => t.id === tabContextMenu.tabId);
        const leafCount = tab ? countLeaves(tab.layout) : 0;
        const canSplit = leafCount < MAX_PANES_PER_TAB;
        const focusPaneId = tab ? (activePaneIdRef.current.get(tab.id) || firstPaneId(tab.layout)) : "";
        return (
          <div
            className="context-menu"
            style={{ position: "fixed", top: tabContextMenu.y, left: tabContextMenu.x, zIndex: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu__item" onClick={() => startTabRename(tabContextMenu.tabId)}>
              {t("terminal.rename")}
            </div>
            <div
              className={`context-menu__item ${!canSplit ? "context-menu__item--disabled" : ""}`}
              onClick={() => canSplit && handleSplitPane(tabContextMenu.tabId, focusPaneId, "horizontal")}
              style={!canSplit ? { opacity: 0.4, cursor: "default" } : undefined}
            >
              {t("terminal.splitRight")}
            </div>
            <div
              className={`context-menu__item ${!canSplit ? "context-menu__item--disabled" : ""}`}
              onClick={() => canSplit && handleSplitPane(tabContextMenu.tabId, focusPaneId, "vertical")}
              style={!canSplit ? { opacity: 0.4, cursor: "default" } : undefined}
            >
              {t("terminal.splitDown")}
            </div>
            <div className="context-menu__separator" />
            <div
              className="context-menu__item context-menu__item--danger"
              onClick={() => { setTabContextMenu(null); handleCloseTab(tabContextMenu.tabId); }}
            >
              {t("terminal.closePane")}
            </div>
          </div>
        );
      })()}

      {/* ── + 按钮右键菜单 ── */}
      {addMenuPos && (
        <div
          className="context-menu"
          style={{ position: "fixed", top: addMenuPos.y, left: addMenuPos.x, zIndex: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu__item" onClick={() => { setAddMenuPos(null); handleAddTab(); }}>
            {t("terminal.newTerminal")}
          </div>
          <div className="context-menu__item" onClick={handleAddTabWithDir}>
            {t("terminal.chooseDir")}
          </div>
        </div>
      )}
    </div>
  );
}
