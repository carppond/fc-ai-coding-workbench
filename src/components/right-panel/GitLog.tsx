import { useState } from "react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../common/Toast";
import { useConfirm } from "../common/ConfirmDialog";
import {
  GitCommitHorizontal, Tag, ChevronDown, ChevronRight,
  Plus, Upload, Trash2,
} from "lucide-react";

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

type TabType = "log" | "tags";

export function GitLog() {
  const logEntries = useGitStore((s) => s.logEntries);
  const tagEntries = useGitStore((s) => s.tagEntries);
  const createTag = useGitStore((s) => s.createTag);
  const deleteTag = useGitStore((s) => s.deleteTag);
  const pushTag = useGitStore((s) => s.pushTag);
  const operating = useGitStore((s) => s.operating);
  const gitPath = useProjectStore((s) => s.gitContextPath ?? s.activeProject?.path ?? null);
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("log");

  // Tag 创建状态
  const [showCreate, setShowCreate] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [annotated, setAnnotated] = useState(false);

  const handleCreateTag = async () => {
    if (!gitPath || !tagName.trim()) return;
    const ok = await createTag(
      gitPath,
      tagName.trim(),
      annotated ? tagMessage.trim() || undefined : undefined,
      annotated,
    );
    if (ok) {
      toast(t("git.tagCreated"), "success");
      setTagName("");
      setTagMessage("");
      setAnnotated(false);
      setShowCreate(false);
    }
  };

  const handleDeleteTag = async (name: string) => {
    if (!gitPath) return;
    const ok = await confirm({
      title: t("git.deleteTag"),
      message: t("git.deleteTagConfirm").replace("{name}", name),
    });
    if (!ok) return;
    const result = await deleteTag(gitPath, name);
    if (result) {
      toast(t("git.tagDeleted"), "success");
    }
  };

  const handlePushTag = async (name: string) => {
    if (!gitPath) return;
    const ok = await pushTag(gitPath, name);
    if (ok) {
      toast(t("git.tagPushed"), "success");
    }
  };

  return (
    <div className={`git-log ${collapsed ? "git-log--collapsed" : ""}`}>
      {/* 头部：折叠按钮 + tab 切换 */}
      <div className="git-log__header">
        <span
          className="git-log__collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
        <span
          className={`git-log__tab ${activeTab === "log" ? "git-log__tab--active" : ""}`}
          onClick={() => { setActiveTab("log"); if (collapsed) setCollapsed(false); }}
        >
          <GitCommitHorizontal size={12} />
          {t("git.log")}
        </span>
        <span
          className={`git-log__tab ${activeTab === "tags" ? "git-log__tab--active" : ""}`}
          onClick={() => { setActiveTab("tags"); if (collapsed) setCollapsed(false); }}
        >
          <Tag size={12} />
          {t("git.tags")} ({tagEntries.length})
        </span>
        {activeTab === "tags" && (
          <button
            className="git-log__header-action"
            onClick={(e) => {
              e.stopPropagation();
              setShowCreate((v) => !v);
              if (collapsed) setCollapsed(false);
            }}
            title={t("git.createTag")}
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {/* 提交日志 */}
          {activeTab === "log" && (
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

          {/* 标签 */}
          {activeTab === "tags" && (
            <>
              {showCreate && (
                <div className="git-tags__create">
                  <input
                    className="git-tags__input"
                    placeholder={t("git.tagName")}
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  />
                  {annotated && (
                    <input
                      className="git-tags__input"
                      placeholder={t("git.tagMessage")}
                      value={tagMessage}
                      onChange={(e) => setTagMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                      style={{ minWidth: 120 }}
                    />
                  )}
                  <label className="git-tags__checkbox">
                    <input
                      type="checkbox"
                      checked={annotated}
                      onChange={(e) => setAnnotated(e.target.checked)}
                    />
                    {t("git.annotatedTag")}
                  </label>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={handleCreateTag}
                    disabled={operating || !tagName.trim()}
                  >
                    {t("git.createTag")}
                  </button>
                </div>
              )}
              {tagEntries.length === 0 ? (
                <div className="git-log__empty">{t("git.noTags")}</div>
              ) : (
                <div className="git-log__list">
                  {tagEntries.map((entry) => (
                    <div key={entry.name} className="git-tags__entry">
                      <div className="git-tags__entry-info">
                        <span className="git-tags__entry-name">
                          {entry.name}
                          {entry.is_annotated && (
                            <Tag size={10} style={{ marginLeft: 4, opacity: 0.5, verticalAlign: "middle" }} />
                          )}
                        </span>
                        {entry.message && (
                          <span className="git-tags__entry-message">{entry.message}</span>
                        )}
                        <div className="git-tags__entry-meta">
                          <span className="git-tags__entry-hash">{entry.hash.slice(0, 7)}</span>
                          {entry.timestamp > 0 && <span>{relativeTime(entry.timestamp, locale)}</span>}
                        </div>
                      </div>
                      <div className="git-tags__entry-actions">
                        <button
                          className="git-tags__action-btn"
                          onClick={() => handlePushTag(entry.name)}
                          disabled={operating}
                          title={t("git.pushTag")}
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          className="git-tags__action-btn git-tags__action-btn--danger"
                          onClick={() => handleDeleteTag(entry.name)}
                          disabled={operating}
                          title={t("git.deleteTag")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
