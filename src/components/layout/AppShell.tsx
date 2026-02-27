import { useEffect, useState, useCallback } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { TopBar } from "./TopBar";
import { LeftPanel } from "../left-panel/LeftPanel";
import { CenterPanel } from "../center-panel/CenterPanel";
import { RightPanel } from "../right-panel/RightPanel";
import { SetupWizard } from "../onboarding/SetupWizard";
import { QuickOpen } from "../common/QuickOpen";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";

export function AppShell() {
  const { onboardingComplete, loadSettings, loading, preloadEnvCheck } = useSettingsStore();
  const { loadProjects } = useProjectStore();
  const { t, loadLocale } = useI18n();
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);

  const handleCloseQuickOpen = useCallback(() => setQuickOpenVisible(false), []);

  useEffect(() => {
    loadSettings();
    loadProjects();
    loadLocale();
    // Delay env check so it doesn't compete with critical startup rendering
    const id = setTimeout(preloadEnvCheck, 3000);
    return () => clearTimeout(id);
  }, [loadSettings, loadProjects, loadLocale, preloadEnvCheck]);

  // 全局 Cmd+P 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
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

  if (!onboardingComplete) {
    return <SetupWizard />;
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell__content">
        <Allotment>
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

