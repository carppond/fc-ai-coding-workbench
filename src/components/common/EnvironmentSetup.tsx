import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle, XCircle, RefreshCw, Download, ExternalLink, Loader } from "lucide-react";
import * as ipc from "../../ipc/commands";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../lib/i18n";
import { CODING_CLI_IDS, CODING_CLI_INFO, type CodingCli } from "../../lib/codingCli";

type OmpInstallMethod = "native" | "bun" | "brew";
const OMP_INSTALL_METHODS: Record<OmpInstallMethod, string> = {
  native: "cli.installNative",
  bun: "cli.installBun",
  brew: "cli.installBrew",
};

function versionAtLeast(version: string | null, minimum: readonly number[]): boolean {
  const match = version?.match(/\bv?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?/);
  if (!match || match[4]) return false;
  for (let index = 0; index < minimum.length; index++) {
    const part = Number(match[index + 1]);
    if (part !== minimum[index]) return part > minimum[index];
  }
  return true;
}

interface EnvironmentSetupProps {
  compact?: boolean;
}

function SkeletonCards() {
  const { t } = useI18n();
  return (
    <div className="env-setup">
      <div className="env-setup__detecting">
        <Loader size={20} className="env-setup__spinner" />
        <span>{t("env.detecting")}</span>
      </div>
      {["git", "node", "omp", "pi"].map((tool) => (
        <div className="env-card env-card--skeleton" key={tool}>
          <div className="env-card__header">
            <div className="env-card__status">
              <div className="env-skeleton env-skeleton--icon" />
              <div className="env-skeleton env-skeleton--text" />
            </div>
            <div className="env-skeleton env-skeleton--version" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EnvironmentSetup({ compact = false }: EnvironmentSetupProps) {
  const { t } = useI18n();
  const env = useSettingsStore((s) => s.envCache);
  const loading = useSettingsStore((s) => s.envChecking);
  const envError = useSettingsStore((s) => s.envError);
  const updates = useSettingsStore((s) => s.cliUpdates);
  const updateChecking = useSettingsStore((s) => s.cliUpdateChecking);
  const updateErrors = useSettingsStore((s) => s.cliUpdateErrors);
  const loadEnvironment = useSettingsStore((s) => s.loadEnvironment);
  const detect = useSettingsStore((s) => s.refreshEnvCheck);
  const [installing, setInstalling] = useState(false);
  const [installTarget, setInstallTarget] = useState<string | null>(null);
  const [ompMethod, setOmpMethod] = useState<OmpInstallMethod>("native");
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const installingRef = useRef(false);

  useEffect(() => {
    void loadEnvironment();
  }, [loadEnvironment]);

  useEffect(() => {
    const method = env?.clis.omp.install_method;
    if (method === "brew" || method === "bun" || method === "native") setOmpMethod(method);
  }, [env]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRef.current?.();
    };
  }, []);

  const runCommand = async (commandType: string, method: string, cli?: CodingCli) => {
    if (installingRef.current) return;
    installingRef.current = true;
    setInstalling(true);
    setInstallTarget(cli ? `${commandType}:${cli}` : commandType);
    setLogs([]);
    let unlistenOutput: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    let finished = false;
    const cleanup = () => {
      unlistenOutput?.();
      unlistenDone?.();
      unlistenOutput = undefined;
      unlistenDone = undefined;
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;

    try {
      unlistenOutput = await listen<{ line: string }>("install-output", (event) => {
        if (mountedRef.current) setLogs((previous) => [...previous, event.payload.line]);
      });
      if (!mountedRef.current) {
        cleanup();
        return;
      }
      unlistenDone = await listen<{ success: boolean; error: string | null }>("install-done", (event) => {
        finished = true;
        cleanup();
        installingRef.current = false;
        if (mountedRef.current) {
          setLogs((previous) => [...previous, event.payload.success
            ? `\n${t("env.installSuccess")}`
            : `\n${t("env.installError")}: ${event.payload.error || t("cli.unknownError")}`]);
          setInstalling(false);
          setInstallTarget(null);
        }
        void detect();
      });
      if (!mountedRef.current) {
        cleanup();
        return;
      }
      await ipc.runInstallCommand(commandType, method, cli);
    } catch (error) {
      cleanup();
      installingRef.current = false;
      if (!finished && mountedRef.current) {
        setLogs((previous) => [...previous, `${t("env.installError")}: ${String(error)}`]);
        setInstalling(false);
        setInstallTarget(null);
        void detect();
      }
    }
  };

  if (!env && (loading || !envError)) {
    return <SkeletonCards />;
  }

  if (!env) {
    return (
      <div className="env-setup">
        <div className="env-card__detail">{envError}</div>
        <button className="btn btn--sm btn--ghost" onClick={detect}>
          <RefreshCw size={14} /> {t("env.detectRefresh")}
        </button>
      </div>
    );
  }

  const isMac = env.platform === "macos";
  const gitReady = env.git_installed;
  const nodeReady = env.node_installed;
  const piRuntimeReady = nodeReady && env.npm_installed && versionAtLeast(env.node_version, [22, 19, 0]);
  const bunReady = env.bun_installed && versionAtLeast(env.bun_version, [1, 3, 14]);

  return (
    <div className={`env-setup ${compact ? "env-setup--compact" : ""}`}>
      {/* Git Card */}
      <div className={`env-card env-card--fade-in ${gitReady ? "env-card--ok" : "env-card--missing"}`}>
        <div className="env-card__header">
          <div className="env-card__status">
            {gitReady ? (
              <CheckCircle size={18} className="env-card__icon env-card__icon--ok" />
            ) : (
              <XCircle size={18} className="env-card__icon env-card__icon--missing" />
            )}
            <span className="env-card__name">Git</span>
          </div>
          {gitReady && env.git_version && (
            <span className="env-card__version">{env.git_version}</span>
          )}
        </div>

        {!gitReady && (
          <div className="env-card__actions">
            {isMac && env.brew_installed ? (
              <button
                className="btn btn--sm btn--primary"
                disabled={installing}
                onClick={() => runCommand("install_git", "brew")}
              >
                <Download size={14} />
                {installTarget === "install_git" ? t("env.installing") : t("env.installViaBrew")}
              </button>
            ) : isMac ? (
              <button
                className="btn btn--sm btn--primary"
                disabled={installing}
                onClick={() => runCommand("install_git", "xcode")}
              >
                <Download size={14} />
                {installTarget === "install_git" ? t("env.installing") : t("env.installXcodeTools")}
              </button>
            ) : null}
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => window.open("https://git-scm.com/downloads", "_blank")}
            >
              <ExternalLink size={14} />
              {t("env.openGitScm")}
            </button>
          </div>
        )}
      </div>

      {/* Node.js Card */}
      <div className={`env-card env-card--fade-in ${nodeReady ? "env-card--ok" : "env-card--missing"}`} style={{ animationDelay: "0.05s" }}>
        <div className="env-card__header">
          <div className="env-card__status">
            {nodeReady ? (
              <CheckCircle size={18} className="env-card__icon env-card__icon--ok" />
            ) : (
              <XCircle size={18} className="env-card__icon env-card__icon--missing" />
            )}
            <span className="env-card__name">Node.js</span>
          </div>
          {nodeReady && env.node_version && (
            <span className="env-card__version">{env.node_version}</span>
          )}
        </div>

        {!piRuntimeReady && (
          <div className="env-card__actions">
            {isMac && env.brew_installed ? (
              <button
                className="btn btn--sm btn--primary"
                disabled={installing}
                onClick={() => runCommand("install_node", "brew")}
              >
                <Download size={14} />
                {installTarget === "install_node" ? t("env.installing") : t("env.installViaBrew")}
              </button>
            ) : null}
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => window.open("https://nodejs.org", "_blank")}
            >
              <ExternalLink size={14} />
              {t("env.openNodejsOrg")}
            </button>
          </div>
        )}

        {nodeReady && env.npm_version && (
          <div className="env-card__detail">npm {env.npm_version}</div>
        )}
        {!piRuntimeReady && <div className="env-card__detail">{t("cli.piRuntimeRequired")}</div>}
      </div>

      {CODING_CLI_IDS.map((cli, index) => {
        const status = env.clis[cli];
        const method = cli === "omp" ? ompMethod : "npm";
        const canInstall = cli === "pi" ? piRuntimeReady
          : method === "bun" ? bunReady
          : method === "brew" ? isMac && env.brew_installed : true;
        const update = updates[cli];
        return (
          <div key={cli} className={`env-card env-card--fade-in ${status.installed ? "env-card--ok" : "env-card--missing"}`} style={{ animationDelay: `${0.1 + index * 0.05}s` }}>
            <div className="env-card__header">
              <div className="env-card__status">
                {status.installed
                  ? <CheckCircle size={18} className="env-card__icon env-card__icon--ok" />
                  : <XCircle size={18} className="env-card__icon env-card__icon--missing" />}
                <span className="env-card__name">{CODING_CLI_INFO[cli].label}</span>
              </div>
              {status.installed && status.version && <span className="env-card__version">{status.version}</span>}
            </div>
            {!status.installed && cli === "omp" && (
              <>
                <div className="env-card__method">
                  <span className="env-card__method-label">{t("env.installMethod")}:</span>
                  {(Object.keys(OMP_INSTALL_METHODS) as OmpInstallMethod[]).map((channel) => (
                    channel !== "brew" || (isMac && env.brew_installed) ? (
                      <label className="env-card__radio" key={channel}>
                        <input
                          type="radio"
                          name="omp-install-method"
                          value={channel}
                          checked={ompMethod === channel}
                          onChange={() => setOmpMethod(channel)}
                          disabled={installing}
                        />
                        {t(OMP_INSTALL_METHODS[channel])}
                      </label>
                    ) : null
                  ))}
                </div>
                <div className="env-card__detail">{t("cli.ompNativeHint")}</div>
                {ompMethod === "bun" && (
                  <div className="env-card__detail">
                    {t("cli.bunRuntimeRequired")}{env.bun_version ? ` (${env.bun_version})` : ""}
                  </div>
                )}
              </>
            )}
            {!status.installed && cli === "pi" && (
              <div className="env-card__detail">{t("cli.piRuntimeRequired")}</div>
            )}
            {status.installed && status.install_method && (
              <div className="env-card__detail">{t("env.installedVia")} {status.install_method}</div>
            )}
            {status.installed && updateChecking[cli] && (
              <div className="env-card__detail">{t("env.checkingUpdate")}</div>
            )}
            {status.installed && updateErrors[cli] && (
              <div className="env-card__detail" title={updateErrors[cli]}>{t("env.updateCheckFailed")}</div>
            )}
            <div className="env-card__actions">
              {!status.installed ? (
                <button
                  className="btn btn--sm btn--primary"
                  disabled={installing || !canInstall}
                  onClick={() => void runCommand("install_cli", method, cli)}
                >
                  <Download size={14} />
                  {installTarget === `install_cli:${cli}` ? t("env.installing") : `${t("cli.install")} ${CODING_CLI_INFO[cli].label}`}
                </button>
              ) : update?.update_available ? (
                <button
                  className="btn btn--sm btn--ghost"
                  disabled={installing}
                  onClick={() => void runCommand("update_cli", status.install_method || (cli === "omp" ? "native" : "npm"), cli)}
                >
                  {installTarget === `update_cli:${cli}`
                    ? t("env.installing") : `${t("env.update")} → ${update.latest_version}`}
                </button>
              ) : null}
              {!status.installed && cli === "omp" && ompMethod === "bun" && !bunReady && (
                <button className="btn btn--sm btn--ghost" onClick={() => window.open("https://bun.sh", "_blank")}>
                  <ExternalLink size={14} /> {t("cli.openBun")}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Log area */}
      {logs.length > 0 && (
        <div className="env-log" ref={logRef}>
          {logs.map((line, i) => (
            <div key={i} className="env-log__line">{line}</div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      <button
        className="btn btn--sm btn--ghost env-setup__refresh"
        onClick={detect}
        disabled={loading || installing}
      >
        <RefreshCw size={14} />
        {t("env.detectRefresh")}
      </button>
    </div>
  );
}

EnvironmentSetup.Skeleton = SkeletonCards;
