import { useState } from "react";
import { ChevronDown, ChevronRight, Archive, Play, Trash2 } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../common/Toast";
import { useConfirm } from "../common/ConfirmDialog";

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD} 天前`;
  return d.toLocaleDateString();
}

export function GitStash() {
  const stashEntries = useGitStore((s) => s.stashEntries);
  const stashApply = useGitStore((s) => s.stashApply);
  const stashDrop = useGitStore((s) => s.stashDrop);
  const operating = useGitStore((s) => s.operating);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [collapsed, setCollapsed] = useState(false);

  if (stashEntries.length === 0) return null;

  const handleApply = async (index: number) => {
    if (!activeProject) return;
    const ok = await stashApply(activeProject.path, index);
    if (ok) {
      toast(t("git.stashApplied"), "success");
    }
  };

  const handleDrop = async (index: number) => {
    if (!activeProject) return;
    const ok = await confirm({
      title: t("git.stashDrop"),
      message: t("git.stashDropConfirm"),
    });
    if (!ok) return;
    const result = await stashDrop(activeProject.path, index);
    if (result) {
      toast(t("git.stashDropped"), "success");
    }
  };

  return (
    <div className="git-stash">
      <div className="git-section-header" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Archive size={14} />
        <span className="git-section-header__title">
          {t("git.stash")} ({stashEntries.length})
        </span>
      </div>
      {!collapsed && (
        <div className="git-stash__list">
          {stashEntries.map((entry) => (
            <div key={entry.index} className="git-stash__entry">
              <div className="git-stash__entry-info">
                <span className="git-stash__entry-message">
                  {entry.message || `stash@{${entry.index}}`}
                </span>
                {entry.timestamp > 0 && (
                  <span className="git-stash__entry-time">
                    {formatTime(entry.timestamp)}
                  </span>
                )}
              </div>
              <div className="git-stash__entry-actions">
                <button
                  className="git-stash__action-btn"
                  onClick={() => handleApply(entry.index)}
                  disabled={operating}
                  title={t("git.stashApply")}
                >
                  <Play size={13} />
                </button>
                <button
                  className="git-stash__action-btn git-stash__action-btn--danger"
                  onClick={() => handleDrop(entry.index)}
                  disabled={operating}
                  title={t("git.stashDrop")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
