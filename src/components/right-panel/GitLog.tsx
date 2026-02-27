import { useState } from "react";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";
import { GitCommitHorizontal, ChevronDown, ChevronRight } from "lucide-react";

function relativeTime(ts: number, locale: string): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (locale === "zh") {
    if (seconds < 60) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 30) return `${days} 天前`;
    return `${Math.floor(days / 30)} 个月前`;
  }
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function GitLog() {
  const logEntries = useGitStore((s) => s.logEntries);
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`git-log ${collapsed ? "git-log--collapsed" : ""}`}>
      <div className="git-log__header" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <GitCommitHorizontal size={13} />
        <span>{t("git.log")}</span>
      </div>
      {!collapsed && (
        logEntries.length === 0 ? (
          <div className="git-log__empty">{t("git.noCommits")}</div>
        ) : (
          <div className="git-log__list">
            {logEntries.map((entry) => (
              <div key={entry.hash} className="git-log__entry">
                <span className="git-log__hash">{entry.hash}</span>
                <span className="git-log__message">{entry.message}</span>
                <span className="git-log__meta">
                  <span className="git-log__author">{entry.author}</span>
                  <span className="git-log__time">
                    {relativeTime(entry.timestamp, locale)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
