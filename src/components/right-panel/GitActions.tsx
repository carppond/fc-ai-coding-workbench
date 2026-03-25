import { useEffect, useRef } from "react";
import { Loader2, Sparkles, Archive } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../common/Toast";
import { useConfirm } from "../common/ConfirmDialog";

export function GitActions() {
  const commitMessage = useGitStore((s) => s.commitMessage);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const commit = useGitStore((s) => s.commit);
  const pull = useGitStore((s) => s.pull);
  const push = useGitStore((s) => s.push);
  const operating = useGitStore((s) => s.operating);
  const operationType = useGitStore((s) => s.operationType);
  const generating = useGitStore((s) => s.generating);
  const genCommitMsg = useGitStore((s) => s.generateCommitMessage);
  const stashSave = useGitStore((s) => s.stashSave);
  const error = useGitStore((s) => s.error);
  const clearError = useGitStore((s) => s.clearError);
  const fileStatuses = useGitStore((s) => s.fileStatuses);
  const gitPath = useProjectStore((s) => s.gitContextPath ?? s.activeProject?.path ?? null);
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm } = useConfirm();
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
    if (!gitPath) return;
    const result = await confirm({
      title: t("git.commit"),
      message: t("git.commitConfirm"),
      confirmLabel: t("git.commitAndPush"),
      extraLabel: t("git.commitOnly"),
    });
    if (!result) return;
    const ok = await commit(gitPath);
    if (!ok) return;
    toast(t("git.commitSuccess"), "success");
    if (result === true) {
      const pushOk = await push(gitPath);
      if (pushOk) toast(t("git.pushSuccess"), "success");
    }
  };

  const hasUncommitted = fileStatuses.length > 0;

  const handlePull = async () => {
    if (!gitPath) return;
    const msg = hasUncommitted
      ? t("git.pullConfirmDirty")
      : t("git.pullConfirm");
    if (!(await confirm({ title: t("git.pull"), message: msg }))) return;
    const ok = await pull(gitPath);
    if (ok) toast(t("git.pullSuccess"), "success");
  };

  const handleGenerate = async () => {
    if (!gitPath || !hasStagedFiles) return;
    const ok = await genCommitMsg(gitPath);
    if (!ok) {
      toast(t("git.noStagedForAI"), "error");
    }
  };

  const handleStash = async () => {
    if (!gitPath) return;
    if (!hasUncommitted) {
      toast(t("git.stashNothingToSave"), "error");
      return;
    }
    const ok = await stashSave(gitPath);
    if (ok) {
      toast(t("git.stashSaved"), "success");
    }
  };

  const handlePush = async () => {
    if (!gitPath) return;
    const msg = hasUncommitted
      ? t("git.pushConfirmDirty")
      : t("git.pushConfirm");
    if (!(await confirm({ title: t("git.push"), message: msg }))) return;
    const ok = await push(gitPath);
    if (ok) toast(t("git.pushSuccess"), "success");
  };

  return (
    <div className="git-actions">
      <div className="git-actions__input-wrapper">
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
        <button
          className="git-actions__ai-btn"
          onClick={handleGenerate}
          disabled={!hasStagedFiles || generating || operating}
          title={t("git.generateCommit")}
        >
          {generating ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
        </button>
      </div>
      <div className="git-actions__buttons">
        <button
          className="btn btn--primary btn--sm"
          onClick={handleCommit}
          disabled={!commitMessage.trim() || !hasStagedFiles || operating}
        >
          {operationType === "commit" ? <Loader2 size={13} className="spin" /> : null}
          {t("git.commit")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handlePull}
          disabled={operating}
        >
          {operationType === "pull" ? <Loader2 size={13} className="spin" /> : null}
          {t("git.pull")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handlePush}
          disabled={operating}
        >
          {operationType === "push" ? <Loader2 size={13} className="spin" /> : null}
          {t("git.push")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handleStash}
          disabled={operating || !hasUncommitted}
          title={t("git.stashSave")}
        >
          <Archive size={13} />
          {t("git.stashSave")}
        </button>
      </div>
    </div>
  );
}
