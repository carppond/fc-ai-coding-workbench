import { useEffect, useState, useCallback } from "react";
import { FolderOpen } from "lucide-react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { TopBar } from "./TopBar";
import { LeftPanel } from "../left-panel/LeftPanel";
import { CenterPanel } from "../center-panel/CenterPanel";
import { RightPanel } from "../right-panel/RightPanel";
import { QuickOpen } from "../common/QuickOpen";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { warmupTerminal } from "../../ipc/commands";

export function AppShell() {
  const { loadSettings, loading, preloadEnvCheck } = useSettingsStore();
  const { loadProjects, openProject, activeProject, loading: projectsLoading } = useProjectStore();
  const { t, loadLocale } = useI18n();
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);

  const handleCloseQuickOpen = useCallback(() => setQuickOpenVisible(false), []);

  // 标记平台：macOS 用 titleBarStyle:Transparent，交通灯浮在左上角，
  // 需给 top-bar 左侧留出空间避免遮挡标题。
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    document.documentElement.dataset.os = isMac ? "mac" : "other";
  }, []);

  useEffect(() => {
    loadSettings();
    // Pre-spawn shells only once the restored project is known: a pooled shell
    // is handed out solely for the directory it was started in, so warming up
    // before this would just fill the pool with home-directory shells.
    loadProjects().then(() => {
      warmupTerminal(useProjectStore.getState().activeProject?.path).catch(() => {});
    });
    loadLocale();
    // Delay env check so it doesn't compete with critical startup rendering
    const id = setTimeout(preloadEnvCheck, 3000);
    return () => clearTimeout(id);
  }, [loadSettings, loadProjects, loadLocale, preloadEnvCheck]);

  // Keep Ctrl+P available to coding CLIs for model cycling.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = document.documentElement.dataset.os === "mac";
      const inTerminal = e.target instanceof Element && Boolean(e.target.closest(".xterm"));
      if (!e.defaultPrevented && !(inTerminal && e.ctrlKey)
        && (isMac ? e.metaKey : e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setQuickOpenVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          <div className="empty-state__title">{t("loading")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      {!projectsLoading && !activeProject && (
        <section className="workspace-start" aria-labelledby="workspace-start-title">
          <div className="workspace-start__copy">
            <h1 className="workspace-start__title" id="workspace-start-title">{t("workspace.startTitle")}</h1>
            <p className="workspace-start__description">{t("workspace.startHint")}</p>
            <p className="workspace-start__note">{t("workspace.startNote")}</p>
          </div>
          <button className="btn btn--primary" onClick={openProject}>
            <FolderOpen size={16} />
            {t("topbar.openProject")}
          </button>
        </section>
      )}
      <div className="app-shell__content">
        <Allotment
          onDragStart={() => {
            window.dispatchEvent(new Event("terminal-drag-start"));
          }}
          onDragEnd={() => {
            requestAnimationFrame(() => {
              window.dispatchEvent(new Event("terminal-drag-end"));
            });
          }}
        >
          <Allotment.Pane preferredSize={280} minSize={200} maxSize={400}>
            <LeftPanel />
          </Allotment.Pane>
          <Allotment.Pane>
            <CenterPanel />
          </Allotment.Pane>
          <Allotment.Pane preferredSize={350} minSize={250} maxSize={500}>
            <RightPanel />
          </Allotment.Pane>
        </Allotment>
      </div>
      <QuickOpen visible={quickOpenVisible} onClose={handleCloseQuickOpen} />
    </div>
  );
}

