import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle, XCircle, RefreshCw, Download, ExternalLink, Loader } from "lucide-react";
import * as ipc from "../../ipc/commands";
import type { EnvCheckResult } from "../../ipc/commands";
import { useI18n } from "../../lib/i18n";

interface EnvironmentSetupProps {
  compact?: boolean;
  preloadedEnv?: EnvCheckResult | null;
}

function SkeletonCards() {
  const { t } = useI18n();
  return (
    <div className="env-setup">
      <div className="env-setup__detecting">
        <Loader size={20} className="env-setup__spinner" />
        <span>{t("env.detecting")}</span>
      </div>
      <div className="env-card env-card--skeleton">
        <div className="env-card__header">
          <div className="env-card__status">
            <div className="env-skeleton env-skeleton--icon" />
            <div className="env-skeleton env-skeleton--text" />
          </div>
          <div className="env-skeleton env-skeleton--version" />
        </div>
      </div>
      <div className="env-card env-card--skeleton">
        <div className="env-card__header">
          <div className="env-card__status">
            <div className="env-skeleton env-skeleton--icon" />
            <div className="env-skeleton env-skeleton--text" />
          </div>
          <div className="env-skeleton env-skeleton--version" />
        </div>
      </div>
    </div>
  );
}

export function EnvironmentSetup({ compact = false, preloadedEnv }: EnvironmentSetupProps) {
  const { t } = useI18n();
  const [env, setEnv] = useState<EnvCheckResult | null>(preloadedEnv ?? null);
  const [loading, setLoading] = useState(!preloadedEnv);
  const [installing, setInstalling] = useState(false);
  const [installTarget, setInstallTarget] = useState<string | null>(null);
  const [cliMethod, setCliMethod] = useState<"npm" | "brew">("npm");
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const applyEnv = useCallback((result: EnvCheckResult) => {
    setEnv(result);
    if (result.claude_install_method === "brew") {
      setCliMethod("brew");
    } else if (result.claude_install_method === "npm") {
      setCliMethod("npm");
    } else if (result.brew_installed && result.platform === "macos") {
      setCliMethod("brew");
    }
  }, []);

  const detect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipc.checkEnvironment();
      applyEnv(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [applyEnv]);

  // Use preloaded data if available, otherwise fetch
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (preloadedEnv) {
      applyEnv(preloadedEnv);
      setLoading(false);
    } else {
      detect();
    }
  }, [preloadedEnv, applyEnv, detect]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const runCommand = async (commandType: string, method: string) => {
    setInstalling(true);
    setInstallTarget(commandType);
    setLogs([]);

    const unlistenOutput = await listen<{ line: string }>("install-output", (e) => {
      setLogs((prev) => [...prev, e.payload.line]);
    });

    const unlistenDone = await listen<{ success: boolean; error: string | null }>(
      "install-done",
      (e) => {
        if (e.payload.success) {
          setLogs((prev) => [...prev, `\n${t("env.installSuccess")}`]);
        } else {
          setLogs((prev) => [...prev, `\n${t("env.installError")}: ${e.payload.error || "unknown"}`]);
        }
        setInstalling(false);
        setInstallTarget(null);
        unlistenOutput();
        unlistenDone();
        setTimeout(detect, 500);
      }
    );

    try {
      await ipc.runInstallCommand(commandType, method);
    } catch (err) {
      setLogs((prev) => [...prev, `Error: ${err}`]);
      setInstalling(false);
      setInstallTarget(null);
      unlistenOutput();
      unlistenDone();
    }
  };

  if (loading) {
    return <SkeletonCards />;
  }

  if (!env) return null;

  const isMac = env.platform === "macos";
  const nodeReady = env.node_installed;
  const cliReady = env.claude_installed;

  return (
    <div className={`env-setup ${compact ? "env-setup--compact" : ""}`}>
      {/* Node.js Card */}
      <div className={`env-card env-card--fade-in ${nodeReady ? "env-card--ok" : "env-card--missing"}`}>
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

        {!nodeReady && (
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
      </div>

      {/* Claude CLI Card */}
      <div className={`env-card env-card--fade-in ${cliReady ? "env-card--ok" : "env-card--missing"}`} style={{ animationDelay: "0.05s" }}>
        <div className="env-card__header">
          <div className="env-card__status">
            {cliReady ? (
              <CheckCircle size={18} className="env-card__icon env-card__icon--ok" />
            ) : (
              <XCircle size={18} className="env-card__icon env-card__icon--missing" />
            )}
            <span className="env-card__name">Claude CLI</span>
          </div>
          {cliReady && env.claude_version && (
            <span className="env-card__version">{env.claude_version}</span>
          )}
        </div>

        {/* Only show method selector when CLI is NOT installed and brew is available */}
        {!cliReady && isMac && env.brew_installed && (
          <div className="env-card__method">
            <span className="env-card__method-label">{t("env.installMethod")}:</span>
            <label className="env-card__radio">
              <input
                type="radio"
                name="cli-method"
                value="npm"
                checked={cliMethod === "npm"}
                onChange={() => setCliMethod("npm")}
                disabled={installing}
              />
              npm
            </label>
            <label className="env-card__radio">
              <input
                type="radio"
                name="cli-method"
                value="brew"
                checked={cliMethod === "brew"}
                onChange={() => setCliMethod("brew")}
                disabled={installing}
              />
              brew
            </label>
          </div>
        )}

        {cliReady && env.claude_install_method && (
          <div className="env-card__detail">
            {t("env.installedVia")} {env.claude_install_method}
          </div>
        )}

        <div className="env-card__actions">
          {!cliReady ? (
            <button
              className="btn btn--sm btn--primary"
              disabled={installing || !nodeReady}
              onClick={() => runCommand("install_cli", cliMethod)}
              title={!nodeReady ? t("env.needNodeFirst") : ""}
            >
              <Download size={14} />
              {installTarget === "install_cli" ? t("env.installing") : t("env.install")}
            </button>
          ) : (
            <button
              className="btn btn--sm btn--ghost"
              disabled={installing}
              onClick={() => runCommand("update_cli", env.claude_install_method || cliMethod)}
            >
              {installTarget === "update_cli" ? t("env.installing") : t("env.update")}
            </button>
          )}
        </div>
      </div>

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
