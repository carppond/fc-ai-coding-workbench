import { useState, useEffect } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useSettingsStore, type Theme } from "../../stores/settingsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";
import type { EnvCheckResult } from "../../ipc/commands";
import { EnvironmentSetup } from "../common/EnvironmentSetup";

type Step = "welcome" | "environment" | "apiConfig" | "theme" | "project";

const STEPS: Step[] = ["welcome", "environment", "apiConfig", "theme", "project"];

const THEME_COLORS: Record<Theme, { name: string; colors: string[] }> = {
  mocha: { name: "Mocha", colors: ["#1e1e2e", "#89b4fa", "#a6e3a1", "#f38ba8"] },
  macchiato: { name: "Macchiato", colors: ["#24273a", "#8aadf4", "#a6da95", "#ed8796"] },
  frappe: { name: "Frappé", colors: ["#303446", "#8caaee", "#a6d189", "#e78284"] },
  dracula: { name: "Dracula", colors: ["#282a36", "#bd93f9", "#50fa7b", "#ff5555"] },
  nord: { name: "Nord", colors: ["#2e3440", "#88c0d0", "#a3be8c", "#bf616a"] },
  tokyoNight: { name: "Tokyo Night", colors: ["#1a1b26", "#7aa2f7", "#9ece6a", "#f7768e"] },
  oneDark: { name: "One Dark", colors: ["#282c34", "#61afef", "#98c379", "#e06c75"] },
  gruvboxDark: { name: "Gruvbox", colors: ["#282828", "#83a598", "#b8bb26", "#fb4934"] },
  monokai: { name: "Monokai", colors: ["#272822", "#66d9ef", "#a6e22e", "#f92672"] },
  rosePine: { name: "Rosé Pine", colors: ["#191724", "#c4a7e7", "#9ccfd8", "#eb6f92"] },
  ayuDark: { name: "Ayu Dark", colors: ["#0b0e14", "#e6b450", "#7fd962", "#d95757"] },
  everforest: { name: "Everforest", colors: ["#2d353b", "#a7c080", "#83c092", "#e67e80"] },
  latte: { name: "Latte", colors: ["#eff1f5", "#1e66f5", "#40a02b", "#d20f39"] },
  githubLight: { name: "GitHub Light", colors: ["#ffffff", "#0969da", "#1a7f37", "#cf222e"] },
  solarizedLight: { name: "Solarized", colors: ["#fdf6e3", "#268bd2", "#859900", "#dc322f"] },
};

export function SetupWizard() {
  const [step, setStep] = useState<Step>("welcome");
  const { theme, setTheme, setOnboardingComplete } = useSettingsStore();
  const { activeProject, openProject } = useProjectStore();
  const { t } = useI18n();

  // Preload environment detection on wizard mount (background)
  const [preloadedEnv, setPreloadedEnv] = useState<EnvCheckResult | null>(null);
  useEffect(() => {
    ipc.checkEnvironment().then(setPreloadedEnv).catch(() => {});
  }, []);

  // API config state
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [platform, setPlatform] = useState("macos");
  const [shellConfigPath, setShellConfigPath] = useState("~/.zshrc");
  const [writeStatus, setWriteStatus] = useState<"idle" | "success" | "error">("idle");
  const [writtenPath, setWrittenPath] = useState("");

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    ipc.detectPlatform().then(setPlatform).catch(() => {});
    ipc.getShellConfigPath().then(setShellConfigPath).catch(() => {});
  }, []);

  const handleNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const handleBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleFinish = async () => {
    await setOnboardingComplete(true);
  };

  // Build preview content
  const previewBaseUrl = baseUrl || "https://api.anthropic.com";
  const previewToken = authToken || "sk-ant-...";
  const previewLines =
    platform === "windows"
      ? [
          `setx ANTHROPIC_BASE_URL "${previewBaseUrl}"`,
          `setx ANTHROPIC_AUTH_TOKEN "${previewToken}"`,
        ]
      : [
          `export ANTHROPIC_BASE_URL="${previewBaseUrl}"`,
          `export ANTHROPIC_AUTH_TOKEN="${previewToken}"`,
        ];

  const handleWriteConfig = async () => {
    if (!baseUrl && !authToken) return;
    const content = previewLines.join("\n");
    const msg = t("wizard.writeConfirm")
      .replace("{path}", shellConfigPath)
      .replace("{content}", content);
    if (!(await ask(msg, { title: t("wizard.apiConfig"), kind: "info" }))) return;

    try {
      const path = await ipc.writeEnvToShell(
        baseUrl || "https://api.anthropic.com",
        authToken
      );
      setWrittenPath(path);
      setWriteStatus("success");
    } catch {
      setWriteStatus("error");
    }
  };

  return (
    <div className="wizard">
      <div className="wizard__card">
        {/* Step dots */}
        <div className="wizard__steps">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`wizard__step-dot ${i <= stepIndex ? "wizard__step-dot--active" : ""}`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <>
            <div className="wizard__title">{t("wizard.welcome")}</div>
            <div className="wizard__subtitle">{t("wizard.welcomeSubtitle")}</div>
            <div className="wizard__actions">
              <button
                className="btn btn--ghost"
                onClick={() => setOnboardingComplete(true)}
              >
                {t("wizard.skipSetup")}
              </button>
              <button className="btn btn--primary" onClick={handleNext}>
                {t("wizard.getStarted")}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Environment */}
        {step === "environment" && (
          <>
            <div className="wizard__title">{t("wizard.environment")}</div>
            <div className="wizard__subtitle">{t("wizard.environmentSubtitle")}</div>

            <EnvironmentSetup preloadedEnv={preloadedEnv} />

            <div className="wizard__actions">
              <button className="btn btn--ghost" onClick={handleBack}>
                {t("wizard.back")}
              </button>
              <button className="btn btn--ghost" onClick={handleNext}>
                {t("wizard.skip")}
              </button>
              <button className="btn btn--primary" onClick={handleNext}>
                {t("wizard.next")}
              </button>
            </div>
          </>
        )}

        {/* Step 3: API Config */}
        {step === "apiConfig" && (
          <>
            <div className="wizard__title">{t("wizard.apiConfig")}</div>
            <div className="wizard__subtitle">{t("wizard.apiConfigSubtitle")}</div>

            <div className="wizard__field">
              <label className="wizard__label">{t("wizard.baseUrl")}</label>
              <input
                className="wizard__input"
                type="text"
                placeholder={t("wizard.baseUrlPlaceholder")}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="wizard__field">
              <label className="wizard__label">{t("wizard.authToken")}</label>
              <input
                className="wizard__input"
                type="password"
                placeholder="sk-ant-..."
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
            </div>

            {/* Preview */}
            {(baseUrl || authToken) && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  background: "var(--bg-primary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  fontFamily: '"SF Mono", monospace',
                  overflowX: "auto",
                  wordBreak: "break-all",
                  overflowWrap: "break-word",
                }}
              >
                <div style={{ color: "var(--text-muted)", marginBottom: 8, fontFamily: "inherit", fontSize: 11 }}>
                  {t("wizard.preview")} <strong>{shellConfigPath}</strong>
                </div>
                {previewLines.map((line, i) => (
                  <div key={i} style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>{line}</div>
                ))}
              </div>
            )}

            {/* Write button */}
            {(baseUrl || authToken) && writeStatus === "idle" && (
              <button
                className="btn btn--primary btn--sm"
                onClick={handleWriteConfig}
                style={{ marginBottom: 12 }}
              >
                {t("wizard.writeToShell")}
              </button>
            )}

            {/* Success message */}
            {writeStatus === "success" && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "rgba(166, 227, 161, 0.1)",
                  border: "1px solid var(--success)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  color: "var(--success)",
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {t("wizard.writeSuccess").replace("{path}", writtenPath)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {t("wizard.writeHintAuto")}
                </div>
                {platform !== "windows" && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("wizard.writeHintExternal").replace("{path}", writtenPath)}
                  </div>
                )}
                {platform === "windows" && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("wizard.writeHintWindows")}
                  </div>
                )}
              </div>
            )}

            {writeStatus === "error" && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "rgba(243, 139, 168, 0.1)",
                  border: "1px solid var(--error)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  color: "var(--error)",
                }}
              >
                Failed to write config file
              </div>
            )}

            <div className="wizard__actions">
              <button className="btn btn--ghost" onClick={handleBack}>
                {t("wizard.back")}
              </button>
              <button className="btn btn--ghost" onClick={handleNext}>
                {t("wizard.skip")}
              </button>
              <button className="btn btn--primary" onClick={handleNext}>
                {t("wizard.next")}
              </button>
            </div>
          </>
        )}

        {/* Step 4: Theme */}
        {step === "theme" && (
          <>
            <div className="wizard__title">{t("wizard.themeTitle")}</div>
            <div className="wizard__subtitle">{t("wizard.themeSubtitle")}</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {(Object.keys(THEME_COLORS) as Theme[]).map((themeKey) => {
                const { name, colors } = THEME_COLORS[themeKey];
                const isActive = theme === themeKey;
                return (
                  <button
                    key={themeKey}
                    onClick={() => setTheme(themeKey)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "16px 12px",
                      border: isActive
                        ? "2px solid var(--accent)"
                        : "2px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      background: isActive ? "var(--accent-dim)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", gap: 6 }}>
                      {colors.map((color, i) => (
                        <div
                          key={i}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: color,
                            border: "1px solid rgba(128,128,128,0.2)",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="wizard__actions">
              <button className="btn btn--ghost" onClick={handleBack}>
                {t("wizard.back")}
              </button>
              <button className="btn btn--primary" onClick={handleNext}>
                {t("wizard.next")}
              </button>
            </div>
          </>
        )}

        {/* Step 5: Open Project */}
        {step === "project" && (
          <>
            <div className="wizard__title">{t("wizard.openProject")}</div>
            <div className="wizard__subtitle">{t("wizard.openProjectSubtitle")}</div>
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "center", padding: 12 }}
                onClick={openProject}
              >
                {t("wizard.chooseProjectFolder")}
              </button>
            </div>
            {activeProject && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "rgba(166, 227, 161, 0.1)",
                  border: "1px solid var(--success)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  color: "var(--success)",
                }}
              >
                <div style={{ fontWeight: 500 }}>{t("wizard.projectSelected")}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {activeProject.path}
                </div>
              </div>
            )}
            <div className="wizard__actions">
              <button className="btn btn--ghost" onClick={handleBack}>
                {t("wizard.back")}
              </button>
              <button className="btn btn--primary" onClick={handleFinish}>
                {t("wizard.finishSetup")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
