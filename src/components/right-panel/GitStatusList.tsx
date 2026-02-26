import { useState, useMemo } from "react";
import { CheckCircle2, Circle, Plus, Minus, Undo2 } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { useConfirm } from "../common/ConfirmDialog";

const VISIBLE_LIMIT = 100;
const MAX_STATUS_ENTRIES = 500;

export function GitStatusList() {
  const fileStatuses = useGitStore((s) => s.fileStatuses);
  const selectedFile = useGitStore((s) => s.selectedFile);
  const selectFile = useGitStore((s) => s.selectFile);
  const stageFile = useGitStore((s) => s.stageFile);
  const unstageFile = useGitStore((s) => s.unstageFile);
  const stageAll = useGitStore((s) => s.stageAll);
  const unstageAll = useGitStore((s) => s.unstageAll);
  const discardFile = useGitStore((s) => s.discardFile);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { t } = useI18n();
  const { confirm } = useConfirm();

  const [expandedStaged, setExpandedStaged] = useState(false);
  const [expandedUnstaged, setExpandedUnstaged] = useState(false);

  const staged = useMemo(() => fileStatuses.filter((f) => f.staged), [fileStatuses]);
  const unstaged = useMemo(() => fileStatuses.filter((f) => !f.staged), [fileStatuses]);
  const isTruncated = fileStatuses.length >= MAX_STATUS_ENTRIES;

  const visibleStaged = expandedStaged ? staged : staged.slice(0, VISIBLE_LIMIT);
  const visibleUnstaged = expandedUnstaged ? unstaged : unstaged.slice(0, VISIBLE_LIMIT);
  const hiddenStagedCount = staged.length - visibleStaged.length;
  const hiddenUnstagedCount = unstaged.length - visibleUnstaged.length;

  const handleSelect = (filePath: string, isStaged: boolean) => {
    if (!activeProject) return;
    selectFile(activeProject.path, filePath, isStaged);
  };

  const handleStage = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (!activeProject) return;
    stageFile(activeProject.path, filePath);
  };

  const handleUnstage = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (!activeProject) return;
    unstageFile(activeProject.path, filePath);
  };

  const handleDiscard = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (!activeProject) return;
    if (!(await confirm({ title: t("git.discard"), message: t("git.discardConfirm"), confirmLabel: t("confirm.delete") }))) return;
    discardFile(activeProject.path, filePath);
  };

  const isSelected = (path: string, isStaged: boolean) =>
    selectedFile?.path === path && selectedFile?.staged === isStaged;

  const statusClass = (status: string) => {
    switch (status) {
      case "added":
      case "untracked":
        return "git-file-entry__status--added";
      case "modified":
        return "git-file-entry__status--modified";
      case "deleted":
        return "git-file-entry__status--deleted";
      default:
        return "";
    }
  };

  const statusLetter = (status: string) => {
    switch (status) {
      case "added":
        return "A";
      case "modified":
        return "M";
      case "deleted":
        return "D";
      case "untracked":
        return "?";
      case "renamed":
        return "R";
      default:
        return "?";
    }
  };

  if (fileStatuses.length === 0) {
    return (
      <div className="git-status-list">
        <div
          style={{
            padding: "16px 8px",
            color: "var(--text-muted)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {t("git.workingTreeClean")}
        </div>
      </div>
    );
  }

  return (
    <div className="git-status-list">
      {staged.length > 0 && (
        <div className="git-status-list__section">
          <div className="git-status-list__section-title git-status-list__section-title--staged">
            <CheckCircle2 size={12} />
            <span style={{ flex: 1 }}>{t("git.staged")} ({staged.length})</span>
            <button
              className="git-status-list__section-btn"
              onClick={() => activeProject && unstageAll(activeProject.path)}
              title={t("git.unstageAll")}
            >
              <Minus size={12} />
            </button>
          </div>
          {visibleStaged.map((f) => (
            <div
              key={`s-${f.path}`}
              className={`git-file-entry ${isSelected(f.path, true) ? "git-file-entry--selected" : ""}`}
              onClick={() => handleSelect(f.path, true)}
            >
              <span className="git-file-entry__staged-icon git-file-entry__staged-icon--yes">
                <CheckCircle2 size={13} />
              </span>
              <span className={`git-file-entry__status ${statusClass(f.status)}`}>
                {statusLetter(f.status)}
              </span>
              <span className="git-file-entry__path">{f.path}</span>
              <button
                className="git-file-entry__action"
                onClick={(e) => handleUnstage(e, f.path)}
                title={t("git.unstage")}
              >
                <Minus size={13} />
              </button>
            </div>
          ))}
          {hiddenStagedCount > 0 && (
            <button
              className="git-status-list__toggle"
              onClick={() => setExpandedStaged(true)}
            >
              {t("git.showMore").replace("{count}", String(hiddenStagedCount))}
            </button>
          )}
          {expandedStaged && staged.length > VISIBLE_LIMIT && (
            <button
              className="git-status-list__toggle"
              onClick={() => setExpandedStaged(false)}
            >
              {t("git.showLess")}
            </button>
          )}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="git-status-list__section">
          <div className="git-status-list__section-title git-status-list__section-title--changes">
            <Circle size={12} />
            <span style={{ flex: 1 }}>{t("git.changes")} ({unstaged.length})</span>
            <button
              className="git-status-list__section-btn"
              onClick={() => activeProject && stageAll(activeProject.path)}
              title={t("git.stageAll")}
            >
              <Plus size={12} />
            </button>
          </div>
          {visibleUnstaged.map((f) => (
            <div
              key={`u-${f.path}`}
              className={`git-file-entry ${isSelected(f.path, false) ? "git-file-entry--selected" : ""}`}
              onClick={() => handleSelect(f.path, false)}
            >
              <span className="git-file-entry__staged-icon git-file-entry__staged-icon--no">
                <Circle size={13} />
              </span>
              <span className={`git-file-entry__status ${statusClass(f.status)}`}>
                {statusLetter(f.status)}
              </span>
              <span className="git-file-entry__path">{f.path}</span>
              <button
                className="git-file-entry__action"
                onClick={(e) => handleDiscard(e, f.path)}
                title={t("git.discard")}
              >
                <Undo2 size={13} />
              </button>
              <button
                className="git-file-entry__action"
                onClick={(e) => handleStage(e, f.path)}
                title={t("git.stage")}
              >
                <Plus size={13} />
              </button>
            </div>
          ))}
          {hiddenUnstagedCount > 0 && (
            <button
              className="git-status-list__toggle"
              onClick={() => setExpandedUnstaged(true)}
            >
              {t("git.showMore").replace("{count}", String(hiddenUnstagedCount))}
            </button>
          )}
          {expandedUnstaged && unstaged.length > VISIBLE_LIMIT && (
            <button
              className="git-status-list__toggle"
              onClick={() => setExpandedUnstaged(false)}
            >
              {t("git.showLess")}
            </button>
          )}
        </div>
      )}
      {isTruncated && (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--warning)", fontStyle: "italic" }}>
          {t("git.truncated").replace("{count}", String(MAX_STATUS_ENTRIES))}
        </div>
      )}
    </div>
  );
}
