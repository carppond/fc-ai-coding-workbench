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

/* ── 数据结构 ────────────────────────────────────────── */

interface TerminalPane {
  id: string;
  alive: boolean;
  cwd?: string; // undefined = 项目目录
}

interface TerminalTab {
  id: string;
  title: string;
  panes: TerminalPane[];
  splitDirection: "horizontal" | "vertical" | null; // null = 单窗格
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
  return { id, title, panes: [{ id: nextPaneId(), alive: true, cwd }], splitDirection: null };
}

/* ── 右键菜单状态类型 ────────────────────────────────── */

interface ContextMenuPos {
  x: number;
  y: number;
}
interface TabContextMenu extends ContextMenuPos {
  tabId: string;
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
    return activePaneIdRef.current.get(tab.id) || tab.panes[0]?.id;
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
      return { ...tab, panes: tab.panes.map((p) => (p.id === paneId ? { ...p, alive } : p)) };
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

  /* ── 关闭 Pane ── */
  const handleClosePane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      if (!tab) return prev;
      const remaining = tab.panes.filter((p) => p.id !== paneId);
      if (remaining.length === 0) {
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
        activePaneIdRef.current.set(tabId, remaining[0].id);
        setFocusedPaneId(remaining[0].id);
      }
      return prev.map((t) => t.id !== tabId ? t : {
        ...t,
        panes: remaining,
        splitDirection: remaining.length <= 1 ? null : t.splitDirection,
      });
    });
  }, []);

  /* ── 分屏 ── */
  const handleSplitPane = useCallback((tabId: string, direction: "horizontal" | "vertical") => {
    setTabContextMenu(null);
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      if (tab.panes.length >= MAX_PANES_PER_TAB) return tab;
      if (tab.splitDirection && tab.splitDirection !== direction) return tab;
      const focusPaneId = activePaneIdRef.current.get(tabId) || tab.panes[0].id;
      const sourceCwd = tab.panes.find((p) => p.id === focusPaneId)?.cwd;
      const newPane: TerminalPane = { id: nextPaneId(), alive: true, cwd: sourceCwd };
      return { ...tab, panes: [...tab.panes, newPane], splitDirection: direction };
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
          const paneId = activePaneIdRef.current.get(activeTabId) || curTab.panes[0]?.id;
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
    const pane = curTab.panes.find((p) => p.id === paneId);
    if (!pane?.alive) return;

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

  /* ── 重启 Pane ── */
  const handleRestartPane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        panes: tab.panes.map((p) => {
          if (p.id !== paneId) return p;
          const newId = nextPaneId();
          // 更新 activePaneIdRef
          if (activePaneIdRef.current.get(tabId) === paneId) {
            activePaneIdRef.current.set(tabId, newId);
          }
          return { ...p, id: newId, alive: true };
        }),
      };
    }));
  }, []);

  /* ── 分割线拖拽 ── */
  const handleDividerDrag = useCallback((e: React.MouseEvent, paneIdx: number, vertical: boolean) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const container = handle.parentElement;
    if (!container) return;
    // 获取实际 pane 元素（跳过分割线）
    const paneEls = Array.from(container.children).filter(
      (c) => !(c as HTMLElement).classList.contains("pane-resize-handle")
    ) as HTMLElement[];
    const pane1 = paneEls[paneIdx - 1];
    const pane2 = paneEls[paneIdx];
    if (!pane1 || !pane2) return;

    const startPos = vertical ? e.clientY : e.clientX;
    const size1 = vertical ? pane1.offsetHeight : pane1.offsetWidth;
    const size2 = vertical ? pane2.offsetHeight : pane2.offsetWidth;
    const total = size1 + size2;

    const onMove = (ev: MouseEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      const newSize1 = Math.max(60, Math.min(total - 60, size1 + delta));
      const ratio = newSize1 / total;
      pane1.style.flex = String(ratio);
      pane2.style.flex = String(1 - ratio);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
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

  /* ── 判断当前 tab 是否有任何 pane alive ── */
  const isTabAlive = (tab: TerminalTab) => tab.panes.some((p) => p.alive);

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
              style={{ opacity: isTabAlive(tab) ? 1 : 0.5 }}
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

        {/* Terminal panes — flexbox 布局 + 拖拽分割线 */}
        <div style={{ width: "100%", height: "100%", display: activeTab === "terminal" ? "block" : "none" }}>
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id && activeTab === "terminal";
            const isVertical = tab.splitDirection === "vertical";
            const showPaneHeader = tab.panes.length > 1;

            return (
              <div
                key={tab.id}
                style={{
                  width: "100%", height: "100%",
                  display: isActive ? "flex" : "none",
                  flexDirection: isVertical ? "column" : "row",
                }}
              >
                {tab.panes.flatMap((pane, idx) => {
                  const isFocused = focusedPaneId === pane.id
                    || (!activePaneIdRef.current.has(tab.id) && pane.id === tab.panes[0].id);
                  const elements: React.ReactNode[] = [];

                  {/* 分割线 */}
                  if (idx > 0) {
                    elements.push(
                      <div
                        key={`divider-${pane.id}`}
                        className={`pane-resize-handle ${isVertical ? "pane-resize-handle--vertical" : ""}`}
                        onMouseDown={(e) => handleDividerDrag(e, idx, isVertical)}
                      />
                    );
                  }

                  {/* Pane */}
                  elements.push(
                    <div
                      key={pane.id}
                      style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
                      onClick={showPaneHeader ? () => handlePaneFocus(tab.id, pane.id) : undefined}
                    >
                      {/* Pane header — 仅多 pane 时显示 */}
                      {showPaneHeader && (
                        <div className={`pane-header ${isFocused ? "pane-header--active" : ""}`}>
                          <span className="pane-header__title">
                            {pane.cwd ? pane.cwd.split("/").pop() : "Terminal"}
                          </span>
                          <span
                            className="pane-header__close"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClosePane(tab.id, pane.id);
                            }}
                          >
                            <X size={11} />
                          </span>
                        </div>
                      )}
                      {/* Terminal */}
                      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                        <Terminal
                          key={pane.id}
                          projectPath={projectPath}
                          cwd={pane.cwd}
                          onAliveChange={(alive) => handlePaneAliveChange(tab.id, pane.id, alive)}
                          onSessionReady={(sid) => handlePaneSessionReady(pane.id, sid)}
                          onFocusReady={(fn) => handlePaneFocusReady(pane.id, fn)}
                          visible={isActive}
                        />
                        {/* 退出覆盖层 */}
                        {isActive && !pane.alive && (
                          <div className={showPaneHeader ? "pane-exited-overlay" : "terminal-exited-overlay"}
                            style={showPaneHeader ? { position: "absolute", bottom: 0, left: 0, right: 0 } : undefined}
                          >
                            <span>{t("terminal.exited")}</span>
                            <button
                              className="btn btn--primary btn--sm"
                              onClick={() => handleRestartPane(tab.id, pane.id)}
                            >
                              <RotateCw size={13} />
                              {t("terminal.restart")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );

                  return elements;
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tab 右键菜单 ── */}
      {tabContextMenu && (() => {
        const tab = tabs.find((t) => t.id === tabContextMenu.tabId);
        const canSplitH = tab && (tab.splitDirection === null || tab.splitDirection === "horizontal") && tab.panes.length < MAX_PANES_PER_TAB;
        const canSplitV = tab && (tab.splitDirection === null || tab.splitDirection === "vertical") && tab.panes.length < MAX_PANES_PER_TAB;
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
              className={`context-menu__item ${!canSplitH ? "context-menu__item--disabled" : ""}`}
              onClick={() => canSplitH && handleSplitPane(tabContextMenu.tabId, "horizontal")}
              style={!canSplitH ? { opacity: 0.4, cursor: "default" } : undefined}
            >
              {t("terminal.splitRight")}
            </div>
            <div
              className={`context-menu__item ${!canSplitV ? "context-menu__item--disabled" : ""}`}
              onClick={() => canSplitV && handleSplitPane(tabContextMenu.tabId, "vertical")}
              style={!canSplitV ? { opacity: 0.4, cursor: "default" } : undefined}
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
