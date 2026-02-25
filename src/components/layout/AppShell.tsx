import { useEffect } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { TopBar } from "./TopBar";
import { LeftPanel } from "../left-panel/LeftPanel";
import { CenterPanel } from "../center-panel/CenterPanel";
import { RightPanel } from "../right-panel/RightPanel";
import { SetupWizard } from "../onboarding/SetupWizard";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";

export function AppShell() {
  const { onboardingComplete, loadSettings, loading } = useSettingsStore();
  const { loadProjects } = useProjectStore();
  const { t, loadLocale } = useI18n();

  useEffect(() => {
    loadSettings();
    loadProjects();
    loadLocale();
  }, [loadSettings, loadProjects, loadLocale]);

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
    </div>
  );
}

