import { useEffect, useState, useRef, useCallback } from "react";
import { GitFork, Loader2, AlertTriangle } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../common/Toast";
import { GitOverview } from "./GitOverview";
import { GitStatusList } from "./GitStatusList";
import { GitDiffView } from "./GitDiffView";
import { GitLog } from "./GitLog";
import { GitActions } from "./GitActions";
import { GitStash } from "./GitStash";

function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("git@") ||
    trimmed.startsWith("ssh://")
  );
}

function GitInitForm() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const initRepo = useGitStore((s) => s.initRepo);
  const operating = useGitStore((s) => s.operating);
  const { t } = useI18n();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const handleInit = async (skipRemote: boolean) => {
    if (!activeProject) return;

    const url = remoteUrl.trim();
    if (!skipRemote && url) {
      if (!isValidGitUrl(url)) {
        setUrlError(t("git.invalidUrl"));
        return;
      }
    }
    setUrlError("");

    const ok = await initRepo(activeProject.path, skipRemote ? undefined : url || undefined);
    if (ok) {
      toast(t("git.initSuccess"), "success");
    } else {
      const err = useGitStore.getState().error;
      if (err) {
        toast(err, "error");
        useGitStore.getState().clearError();
      }
    }
  };

  if (!showForm) {
    return (
      <div style={{ marginTop: 24 }}>
        <button
          className="btn btn--primary"
          onClick={() => setShowForm(true)}
        >
          {t("git.initButton")}
        </button>
      </div>
    );
  }

  const hasUrl = remoteUrl.trim().length > 0;

  return (
    <div className="git-init-form">
      <input
        className="git-init-form__input"
        type="text"
        placeholder={t("git.remoteUrlPlaceholder")}
        value={remoteUrl}
        autoFocus
        onChange={(e) => {
          setRemoteUrl(e.target.value);
          setUrlError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleInit(false);
          }
        }}
      />
      <div className="git-init-form__hint">
        {t("git.remoteUrlHint")}
      </div>
      {urlError && (
        <div className="git-init-form__error">{urlError}</div>
      )}
      {hasUrl && (
        <div className="git-init-form__warning">
          <AlertTriangle size={13} />
          <span>{t("git.initRemoteWarning")}</span>
        </div>
      )}
      <div className="git-init-form__actions">
        <button
          className="btn btn--primary btn--sm"
          onClick={() => handleInit(false)}
          disabled={operating}
        >
          {operating ? <Loader2 size={13} className="spin" /> : null}
          {t("git.initButton")}
        </button>
        {hasUrl && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => handleInit(true)}
            disabled={operating}
          >
            {t("git.initSkipRemote")}
          </button>
        )}
      </div>
    </div>
  );
}

const POLL_INTERVAL = 5000;
const MAX_BACKOFF = 30000;

export function RightPanel() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const refresh = useGitStore((s) => s.refresh);
  const refreshLite = useGitStore((s) => s.refreshLite);
  const reset = useGitStore((s) => s.reset);
  const { t } = useI18n();
  const failCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(true);

  useEffect(() => {
    reset();
    if (activeProject) {
      refresh(activeProject.path);
    }
  }, [activeProject]);

  // Smart polling: pause when unfocused, exponential backoff on failure
  // Uses refreshLite (status + branchInfo only) to reduce I/O pressure
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!activeProject || !focusedRef.current) return;

    const backoff = Math.min(POLL_INTERVAL * Math.pow(2, failCountRef.current), MAX_BACKOFF);

    timerRef.current = setTimeout(async () => {
      if (!activeProject || !focusedRef.current) return;
      try {
        await refreshLite(activeProject.path);
        failCountRef.current = 0;
      } catch {
        failCountRef.current = Math.min(failCountRef.current + 1, 5);
      }
      scheduleNext();
    }, backoff);
  }, [activeProject, refreshLite]);

  useEffect(() => {
    if (!activeProject) return;

    const handleFocus = () => {
      focusedRef.current = true;
      failCountRef.current = 0;
      refresh(activeProject.path);
      scheduleNext();
    };

    const handleBlur = () => {
      focusedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Start polling
    scheduleNext();

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeProject, refresh, scheduleNext]);

  // 拖拽分割：直接操作 DOM，不加 wrapper，不触发 re-render
  // 必须放在条件 return 之前（React Hooks 规则）
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const statusEl = handle.previousElementSibling as HTMLElement;
    if (!statusEl) return;
    const startY = e.clientY;
    const startH = statusEl.getBoundingClientRect().height;

    const onMouseMove = (ev: MouseEvent) => {
      const h = Math.max(40, startH + ev.clientY - startY);
      statusEl.style.flex = `0 0 ${h}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  if (!activeProject) {
    return (
      <div className="panel panel--right" style={{ display: "flex", flexDirection: "column" }}>
        <div className="empty-state">
          <GitFork size={32} className="empty-state__icon" />
          <div className="empty-state__title">{t("git.title")}</div>
          <div className="empty-state__subtitle">
            {t("git.openProjectToSee")}
          </div>
        </div>
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div className="panel panel--right" style={{ display: "flex", flexDirection: "column" }}>
        <div className="panel__header">
          <span className="panel__header-title">{t("git.title")}</span>
        </div>
        <div className="empty-state">
          <GitFork size={32} className="empty-state__icon" />
          <div className="empty-state__title">{t("git.notARepo")}</div>
          <div className="empty-state__subtitle">{t("git.initHint")}</div>
          <GitInitForm />
        </div>
      </div>
    );
  }

  return (
    <div className="panel panel--right" style={{ display: "flex", flexDirection: "column" }}>
      <div className="panel__header">
        <span className="panel__header-title">{t("git.title")}</span>
      </div>
      <GitOverview />
      <GitStatusList />
      <div className="git-resize-handle" onMouseDown={handleDragStart}>
        <div className="git-resize-handle__bar" />
      </div>
      <GitDiffView />
      <GitLog />
      <GitStash />
      <GitActions />
    </div>
  );
}
