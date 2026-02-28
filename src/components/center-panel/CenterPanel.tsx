import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, RotateCw, Sparkles } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { Terminal } from "./Terminal";
import { FileViewer } from "./FileViewer";
import { useConfirm } from "../common/ConfirmDialog";
import * as ipc from "../../ipc/commands";

interface TerminalTab {
  id: string;
  title: string;
  alive: boolean;
}

const MAX_TABS = 5;

let tabCounter = 0;
function nextTabId(): string {
  tabCounter += 1;
  return `tab-${tabCounter}`;
}

export function CenterPanel() {
  const { activeProject } = useProjectStore();
  const openFilePath = useFileStore((s) => s.openFilePath);
  const closeFile = useFileStore((s) => s.closeFile);
  const isDirty = useFileStore((s) => s.isDirty);
  const { t } = useI18n();
  const { confirm } = useConfirm();

  // Tab management
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    const id = nextTabId();
    return [{ id, title: "Terminal 1", alive: true }];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const tabCounterRef = useRef(1); // for naming "Terminal N"

  const activeTab = openFilePath ? "file" : "terminal";
  const projectPath = activeProject?.path ?? null;
  const projectId = activeProject?.id ?? null;

  // Reset terminals when switching projects: close all old tabs, create one fresh terminal
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (projectId !== null && prevProjectIdRef.current !== null && projectId !== prevProjectIdRef.current) {
      tabCounterRef.current = 1;
      const id = nextTabId();
      setTabs([{ id, title: "Terminal 1", alive: true }]);
      setActiveTabId(id);
    }
    prevProjectIdRef.current = projectId;
  }, [projectId]);

  const handleAliveChange = useCallback((tabId: string, alive: boolean) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, alive } : tab)));
  }, []);

  const handleAddTab = useCallback(() => {
    if (openFilePath) closeFile();
    const id = nextTabId();
    tabCounterRef.current += 1;
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const newTab: TerminalTab = {
        id,
        title: `Terminal ${tabCounterRef.current}`,
        alive: true,
      };
      return [...prev, newTab];
    });
    setActiveTabId(id);
  }, [openFilePath, closeFile]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev; // Don't close the last tab
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      // If closing the active tab, switch to adjacent tab
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) return currentActive;
        // Switch to the tab before it, or the first remaining
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx]?.id ?? next[0]?.id ?? currentActive;
      });
      return next;
    });
  }, []);

  // 跟踪每个 tab 对应的 terminal session ID 和聚焦函数
  const sessionMapRef = useRef<Map<string, string>>(new Map());
  const focusMapRef = useRef<Map<string, () => void>>(new Map());

  const handleSessionReady = useCallback((tabId: string, sessionId: string | null) => {
    if (sessionId) {
      sessionMapRef.current.set(tabId, sessionId);
    } else {
      sessionMapRef.current.delete(tabId);
    }
  }, []);

  const handleFocusReady = useCallback((tabId: string, focusFn: () => void) => {
    focusMapRef.current.set(tabId, focusFn);
  }, []);

  // 在当前活跃终端启动 Claude Code
  const handleLaunchClaude = useCallback(async () => {
    if (openFilePath) closeFile();
    const sessionId = sessionMapRef.current.get(activeTabId);
    if (!sessionId) return;
    const activeTerminalTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTerminalTab?.alive) return;

    // 检查终端是否空闲（shell 无子进程）
    try {
      const idle = await ipc.isTerminalIdle(sessionId);
      if (!idle) {
        // 终端正在运行其他程序，仅聚焦
        focusMapRef.current.get(activeTabId)?.();
        return;
      }
    } catch {
      // 检查失败时仍允许执行
    }

    ipc.writeTerminal(sessionId, "claude\r");
    // 聚焦终端
    requestAnimationFrame(() => {
      focusMapRef.current.get(activeTabId)?.();
    });
  }, [activeTabId, tabs, openFilePath, closeFile]);

  const handleRestartTab = useCallback((tabId: string) => {
    // Restart: remove the old tab and create a new one in its place
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const newId = nextTabId();
      const newTab: TerminalTab = {
        id: newId,
        title: prev[idx].title,
        alive: true,
      };
      const next = [...prev];
      next[idx] = newTab;
      setActiveTabId(newId);
      return next;
    });
  }, []);

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
            title={tab.title}
          >
            <span
              className="panel-tab__label"
              style={{ opacity: tab.alive ? 1 : 0.5 }}
            >
              {tab.title}
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
            onClick={handleAddTab}
            title={t("terminal.newTab")}
          >
            <Plus size={14} />
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
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* File viewer — shown when a file is open */}
        {openFilePath && (
          <div style={{ width: "100%", height: "100%", display: activeTab === "file" ? "block" : "none" }}>
            <FileViewer />
          </div>
        )}

        {/* Terminal tabs — always mounted, visibility controlled by CSS */}
        <div style={{ width: "100%", height: "100%", display: activeTab === "terminal" ? "block" : "none" }}>
          {tabs.map((tab) => (
            <Terminal
              key={tab.id}
              projectPath={projectPath}
              onAliveChange={(alive) => handleAliveChange(tab.id, alive)}
              onSessionReady={(sid) => handleSessionReady(tab.id, sid)}
              onFocusReady={(fn) => handleFocusReady(tab.id, fn)}
              visible={activeTabId === tab.id && activeTab === "terminal"}
            />
          ))}

          {/* Exited overlay for active tab */}
          {activeTab === "terminal" && tabs.find((t) => t.id === activeTabId && !t.alive) && (
            <div className="terminal-exited-overlay">
              <span>{t("terminal.exited")}</span>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => handleRestartTab(activeTabId)}
              >
                <RotateCw size={13} />
                {t("terminal.restart")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
