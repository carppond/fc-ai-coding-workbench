import { useState, useEffect } from "react";
import { FolderOpen, Globe, Palette, Settings, X } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../lib/i18n";
import { EnvironmentSetup } from "../common/EnvironmentSetup";

export function TopBar() {
  const { openProject } = useProjectStore();
  const { loading, theme, cycleTheme } = useSettingsStore();
  const { t, toggleLocale, locale } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  // Delay mounting EnvironmentSetup so the dialog renders first
  const [mountEnv, setMountEnv] = useState(false);

  useEffect(() => {
    if (showSettings) {
      setMountEnv(false);
      // setTimeout ensures the dialog paints first, then mount the heavy component
      const id = setTimeout(() => setMountEnv(true), 50);
      return () => clearTimeout(id);
    }
  }, [showSettings]);

  if (loading) return null;

  return (
    <>
      <div className="top-bar">
        <span className="top-bar__title">{t("topbar.title")}</span>

        <div className="top-bar__project" onClick={openProject}>
          <FolderOpen size={14} />
          <span className="top-bar__project-name">
            {t("topbar.openProject")}
          </span>
        </div>

        <div className="top-bar__spacer" />

        <button
          className="top-bar__btn"
          onClick={cycleTheme}
          title={`${t("topbar.switchTheme")} (${theme})`}
          style={{ fontSize: 11, fontWeight: 500, width: "auto", gap: 4, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}
        >
          <Palette size={15} color="var(--text-secondary)" />
          <span style={{ color: "var(--text-muted)" }}>{t("topbar.switchTheme")}</span>
        </button>

        <button
          className="top-bar__btn"
          onClick={toggleLocale}
          title={locale === "zh" ? "Switch to English" : "切换到中文"}
          style={{ fontSize: 13, fontWeight: 500, minWidth: 40 }}
        >
          <Globe size={16} color="var(--text-secondary)" />
        </button>

        <button
          className="top-bar__btn"
          onClick={() => setShowSettings(true)}
          title={t("settings.title")}
          style={{ fontSize: 13, fontWeight: 500, minWidth: 32 }}
        >
          <Settings size={16} color="var(--text-secondary)" />
        </button>
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog__header">
              <span className="settings-dialog__title">{t("settings.title")}</span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="settings-dialog__body">
              <div className="settings-dialog__section">
                <div className="settings-dialog__section-title">
                  {t("settings.environment")}
                </div>
                {mountEnv ? <EnvironmentSetup compact /> : <EnvironmentSetup.Skeleton />}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
