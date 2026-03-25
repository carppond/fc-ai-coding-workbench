import { useState } from "react";
import { GitBranch, RefreshCw, ChevronDown } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import { BranchSelector } from "./BranchSelector";

export function GitOverview() {
  const branchInfo = useGitStore((s) => s.branchInfo);
  const loading = useGitStore((s) => s.loading);
  const refresh = useGitStore((s) => s.refresh);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const gitPath = useProjectStore((s) => s.gitContextPath ?? s.activeProject?.path ?? null);
  const { t } = useI18n();

  const [showBranches, setShowBranches] = useState(false);

  const handleRefresh = () => {
    if (gitPath) refresh(gitPath);
  };

  if (!branchInfo) {
    return (
      <div className="git-overview">
        {isGitRepo ? (
          <div className="git-overview__branch">
            <GitBranch size={14} />
            <span style={{ color: "var(--text-muted)" }}>...</span>
            <RefreshCw size={14} className="spin" style={{ marginLeft: "auto" }} />
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("git.notARepo")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="git-overview" style={{ position: "relative" }}>
      <div className="git-overview__branch">
        <GitBranch size={14} />
        <button
          className="git-overview__branch-name"
          onClick={() => setShowBranches(!showBranches)}
          title={t("git.switchBranch")}
        >
          <span>{branchInfo.name}</span>
          <ChevronDown size={12} />
        </button>
        <button
          className="btn btn--ghost btn--icon"
          onClick={handleRefresh}
          disabled={loading}
          style={{ marginLeft: "auto" }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>
      <div className="git-overview__meta">
        {branchInfo.remote && (
          <span style={{ color: "var(--text-muted)" }}>{branchInfo.remote}</span>
        )}
        {branchInfo.ahead > 0 && (
          <span className="git-overview__ahead">+{branchInfo.ahead} {t("git.ahead")}</span>
        )}
        {branchInfo.behind > 0 && (
          <span className="git-overview__behind">
            -{branchInfo.behind} {t("git.behind")}
          </span>
        )}
      </div>

      {showBranches && (
        <BranchSelector onClose={() => setShowBranches(false)} />
      )}
    </div>
  );
}
