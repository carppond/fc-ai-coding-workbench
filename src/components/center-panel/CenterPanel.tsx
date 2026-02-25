import { useState, useCallback, useRef } from "react";
import { Plus, X, RotateCw } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { Terminal } from "./Terminal";
import { FileViewer } from "./FileViewer";

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
  const { openFilePath, closeFile } = useFileStore();
  const { t } = useI18n();

  // Tab management
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    const id = nextTabId();
    return [{ id, title: "Terminal 1", alive: true }];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const tabCounterRef = useRef(1); // for naming "Terminal N"

  const activeTab = openFilePath ? "file" : "terminal";
  const projectPath = activeProject?.path ?? null;

  const handleAliveChange = useCallback((tabId: string, alive: boolean) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, alive } : tab)));
  }, []);

  const handleAddTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      tabCounterRef.current += 1;
      const id = nextTabId();
      const newTab: TerminalTab = {
        id,
        title: `Terminal ${tabCounterRef.current}`,
        alive: true,
      };
      return [...prev, newTab];
    });
    // Set active to the new tab after state update
    setTimeout(() => {
      setTabs((current) => {
        const last = current[current.length - 1];
        if (last) setActiveTabId(last.id);
        return current;
      });
    }, 0);
  }, []);

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

        {/* File tab (when a file is open) */}
        {openFilePath && (
          <button
            className="panel-tab panel-tab--active"
            style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {openFilePath.split("/").pop()}
          </button>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {activeTab === "file" && openFilePath ? (
          <FileViewer />
        ) : (
          <>
            {/* Render all terminal tabs — only the active one is visible */}
            {tabs.map((tab) => (
              <Terminal
                key={tab.id}
                projectPath={projectPath}
                onAliveChange={(alive) => handleAliveChange(tab.id, alive)}
                visible={activeTabId === tab.id && activeTab === "terminal"}
              />
            ))}

            {/* Exited overlay for active tab */}
            {tabs.find((t) => t.id === activeTabId && !t.alive) && (
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
          </>
        )}
      </div>
    </div>
  );
}
