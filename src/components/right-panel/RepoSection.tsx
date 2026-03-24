import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, FolderGit2,
  CheckCircle2, Circle, Plus, Minus, Undo2,
  ArrowDown, ArrowUp, Loader2, Sparkles,
} from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";
import { useConfirm } from "../common/ConfirmDialog";
import { useToast } from "../common/Toast";

// 稳定的空状态对象，避免每次 selector 返回新对象导致无限重渲染
import type { RepoGitState } from "../../stores/gitStore";
const EMPTY_REPO: RepoGitState = {
  fileStatuses: [], branchInfo: null, commitMessage: "",
  isGitRepo: false, loading: false, operating: false,
  operationType: null, generating: false, error: null,
  stashEntries: [], tagEntries: [],
};

interface RepoSectionProps {
  repoPath: string;
  repoName: string;
  defaultCollapsed?: boolean;
}

function statusClass(status: string) {
  switch (status) {
    case "added": case "untracked": return "git-file-entry__status--added";
    case "modified": return "git-file-entry__status--modified";
    case "deleted": return "git-file-entry__status--deleted";
    default: return "";
  }
}

function statusLetter(status: string) {
  switch (status) {
    case "added": return "A";
    case "modified": return "M";
    case "deleted": return "D";
    case "untracked": return "?";
    case "renamed": return "R";
    default: return "?";
  }
}

export function RepoSection({ repoPath, repoName, defaultCollapsed }: RepoSectionProps) {
  const repo = useGitStore((s) => s.repoStates[repoPath]) ?? EMPTY_REPO;
  const selectFile = useGitStore((s) => s.selectFile);
  const stageFile = useGitStore((s) => s.stageFile);
  const unstageFile = useGitStore((s) => s.unstageFile);
  const stageAll = useGitStore((s) => s.stageAll);
  const unstageAll = useGitStore((s) => s.unstageAll);
  const discardFile = useGitStore((s) => s.discardFile);
  const commit = useGitStore((s) => s.commit);
  const pull = useGitStore((s) => s.pull);
  const push = useGitStore((s) => s.push);
  const generateCommitMessage = useGitStore((s) => s.generateCommitMessage);
  const setRepoCommitMessage = useGitStore((s) => s.setRepoCommitMessage);
  const selectedFile = useGitStore((s) => s.selectedFile);
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);

  const { fileStatuses, branchInfo, commitMessage, isGitRepo, operating, generating } = repo;
  const totalChanges = fileStatuses.length;
  const staged = useMemo(() => fileStatuses.filter((f) => f.staged), [fileStatuses]);
  const unstaged = useMemo(() => fileStatuses.filter((f) => !f.staged), [fileStatuses]);

  const isSelected = (path: string, isStaged: boolean) =>
    selectedFile?.path === path && selectedFile?.staged === isStaged;

  const handleDiscard = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (!(await confirm({ title: t("git.discard"), message: t("git.discardConfirm"), confirmLabel: t("confirm.delete") }))) return;
    discardFile(repoPath, filePath);
  };

  const handleCommit = async () => {
    const ok = await commit(repoPath);
    if (ok) toast(t("git.commitSuccess"), "success");
  };

  const handlePull = async () => {
    const ok = await pull(repoPath);
    if (ok) toast(t("git.pullSuccess"), "success");
  };

  const handlePush = async () => {
    const ok = await push(repoPath);
    if (ok) toast(t("git.pushSuccess"), "success");
  };

  return (
    <div className="repo-section">
      {/* 仓库标题栏 */}
      <div
        className="repo-section__header"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <FolderGit2 size={14} />
        <span className="repo-section__name">{repoName}</span>
        {!isGitRepo ? (
          <span className="repo-section__badge repo-section__badge--muted">{t("git.notGitRepo")}</span>
        ) : (
          <span className="repo-section__badge">({totalChanges})</span>
        )}
        {isGitRepo && branchInfo && (
          <span className="repo-section__branch">
            {branchInfo.name}
            {branchInfo.ahead > 0 && <span> ↑{branchInfo.ahead}</span>}
            {branchInfo.behind > 0 && <span> ↓{branchInfo.behind}</span>}
          </span>
        )}
        {isGitRepo && (
          <div className="repo-section__actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn--ghost btn--xs" onClick={handlePull} disabled={operating} title={t("git.pull")}>
              <ArrowDown size={12} />
            </button>
            <button className="btn btn--ghost btn--xs" onClick={handlePush} disabled={operating} title={t("git.push")}>
              <ArrowUp size={12} />
            </button>
          </div>
        )}
      </div>

      {/* 展开内容 */}
      {!collapsed && isGitRepo && (
        <div className="repo-section__body">
          {/* 暂存区 */}
          {staged.length > 0 && (
            <div className="git-status-list__section">
              <div
                className="git-status-list__section-title git-status-list__section-title--staged"
                onClick={() => setStagedCollapsed(!stagedCollapsed)}
              >
                {stagedCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <CheckCircle2 size={12} />
                <span style={{ flex: 1 }}>{t("git.staged")} ({staged.length})</span>
                {!stagedCollapsed && (
                  <button
                    className="git-status-list__section-btn"
                    onClick={(e) => { e.stopPropagation(); unstageAll(repoPath); }}
                    title={t("git.unstageAll")}
                  >
                    <Minus size={12} />
                  </button>
                )}
              </div>
              {!stagedCollapsed && staged.map((f) => (
                <div
                  key={`s-${f.path}`}
                  className={`git-file-entry ${isSelected(f.path, true) ? "git-file-entry--selected" : ""}`}
                  onClick={() => selectFile(repoPath, f.path, true)}
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
                    onClick={(e) => { e.stopPropagation(); unstageFile(repoPath, f.path); }}
                    title={t("git.unstage")}
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 工作区变更 */}
          {unstaged.length > 0 && (
            <div className="git-status-list__section">
              <div
                className="git-status-list__section-title git-status-list__section-title--changes"
                onClick={() => setUnstagedCollapsed(!unstagedCollapsed)}
              >
                {unstagedCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <Circle size={12} />
                <span style={{ flex: 1 }}>{t("git.changes")} ({unstaged.length})</span>
                {!unstagedCollapsed && (
                  <button
                    className="git-status-list__section-btn"
                    onClick={(e) => { e.stopPropagation(); stageAll(repoPath); }}
                    title={t("git.stageAll")}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              {!unstagedCollapsed && unstaged.map((f) => (
                <div
                  key={`u-${f.path}`}
                  className={`git-file-entry ${isSelected(f.path, false) ? "git-file-entry--selected" : ""}`}
                  onClick={() => selectFile(repoPath, f.path, false)}
                >
                  <span className="git-file-entry__staged-icon git-file-entry__staged-icon--no">
                    <Circle size={13} />
                  </span>
                  <span className={`git-file-entry__status ${statusClass(f.status)}`}>
                    {statusLetter(f.status)}
                  </span>
                  <span className="git-file-entry__path">{f.path}</span>
                  <button className="git-file-entry__action" onClick={(e) => handleDiscard(e, f.path)} title={t("git.discard")}>
                    <Undo2 size={13} />
                  </button>
                  <button
                    className="git-file-entry__action"
                    onClick={(e) => { e.stopPropagation(); stageFile(repoPath, f.path); }}
                    title={t("git.stage")}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 无变更提示 */}
          {totalChanges === 0 && (
            <div style={{ padding: "6px 10px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
              {t("git.workingTreeClean")}
            </div>
          )}

          {/* 提交区域 — 仅当有暂存文件或已输入消息时显示 */}
          {(staged.length > 0 || commitMessage.trim()) && (
            <div className="repo-section__commit">
              <textarea
                className="git-actions__input"
                placeholder={t("git.commitMessage")}
                rows={1}
                value={commitMessage}
                onChange={(e) => setRepoCommitMessage(repoPath, e.target.value)}
                disabled={operating}
              />
              <div className="repo-section__commit-actions">
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleCommit}
                  disabled={operating || !commitMessage.trim() || staged.length === 0}
                  style={{ fontSize: 11, padding: "3px 10px" }}
                >
                  {operating ? <Loader2 size={12} className="spin" /> : null}
                  {t("git.commit")}
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => generateCommitMessage(repoPath)}
                  disabled={generating || staged.length === 0}
                  title={t("git.generateCommit")}
                  style={{ padding: "3px 6px" }}
                >
                  {generating ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
