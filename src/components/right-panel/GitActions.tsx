import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../common/Toast";

export function GitActions() {
  const { commitMessage, setCommitMessage, commit, pull, push, operating, error, clearError, fileStatuses } =
    useGitStore();
  const { activeProject } = useProjectStore();
  const { t } = useI18n();
  const { toast } = useToast();
  const prevErrorRef = useRef<string | null>(null);

  const hasStagedFiles = fileStatuses.some((f) => f.staged);

  // Watch for new errors and show as toast
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      toast(error, "error");
      clearError();
    }
    prevErrorRef.current = error;
  }, [error]);

  const handleCommit = async () => {
    if (!activeProject) return;
    const ok = await commit(activeProject.path);
    if (ok) toast(t("git.commitSuccess"), "success");
  };

  const handlePull = async () => {
    if (!activeProject) return;
    if (!window.confirm(t("git.pullConfirm"))) return;
    const ok = await pull(activeProject.path);
    if (ok) toast(t("git.pullSuccess"), "success");
  };

  const handlePush = async () => {
    if (!activeProject) return;
    if (!window.confirm(t("git.pushConfirm"))) return;
    const ok = await push(activeProject.path);
    if (ok) toast(t("git.pushSuccess"), "success");
  };

  return (
    <div className="git-actions">
      <textarea
        className="git-actions__input"
        placeholder={t("git.commitMessage")}
        value={commitMessage}
        rows={2}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleCommit();
          }
        }}
      />
      <div className="git-actions__buttons">
        <button
          className="btn btn--primary btn--sm"
          onClick={handleCommit}
          disabled={!commitMessage.trim() || !hasStagedFiles || operating}
        >
          {operating ? <Loader2 size={13} className="spin" /> : null}
          {t("git.commit")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handlePull}
          disabled={operating}
        >
          {t("git.pull")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handlePush}
          disabled={operating}
        >
          {t("git.push")}
        </button>
      </div>
    </div>
  );
}
