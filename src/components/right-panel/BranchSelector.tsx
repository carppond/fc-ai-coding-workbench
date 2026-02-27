import { useState, useEffect, useRef } from "react";
import { Check, Trash2, Plus, Search } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useProjectStore } from "../../stores/projectStore";
import { useI18n } from "../../lib/i18n";
import type { BranchListItem } from "../../lib/types";

interface Props {
  onClose: () => void;
}

export function BranchSelector({ onClose }: Props) {
  const branches = useGitStore((s) => s.branches);
  const loadBranches = useGitStore((s) => s.loadBranches);
  const checkoutBranch = useGitStore((s) => s.checkoutBranch);
  const createBranch = useGitStore((s) => s.createBranch);
  const deleteBranch = useGitStore((s) => s.deleteBranch);
  const operating = useGitStore((s) => s.operating);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { t } = useI18n();

  const [filter, setFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProject) loadBranches(activeProject.path);
  }, [activeProject, loadBranches]);

  // 自动聚焦搜索框
  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filterLower = filter.toLowerCase();
  const localBranches = branches.filter(
    (b) => !b.is_remote && b.name.toLowerCase().includes(filterLower)
  );
  const remoteBranches = branches.filter(
    (b) => b.is_remote && b.name.toLowerCase().includes(filterLower)
  );

  const handleCheckout = async (branch: BranchListItem) => {
    if (!activeProject || branch.is_current || operating) return;
    // 远程分支取掉 origin/ 前缀
    const name = branch.is_remote
      ? branch.name.replace(/^[^/]+\//, "")
      : branch.name;
    const ok = await checkoutBranch(activeProject.path, name);
    if (ok) onClose();
  };

  const handleCreate = async () => {
    if (!activeProject || !newBranchName.trim() || operating) return;
    const ok = await createBranch(activeProject.path, newBranchName.trim());
    if (ok) setNewBranchName("");
  };

  const handleDelete = async (name: string, force: boolean) => {
    if (!activeProject || operating) return;
    await deleteBranch(activeProject.path, name, force);
    setConfirmDelete(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="branch-selector" ref={panelRef} onKeyDown={handleKeyDown}>
      {/* 搜索过滤 */}
      <div className="branch-selector__search">
        <Search size={14} />
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("git.searchBranches")}
          className="branch-selector__search-input"
        />
      </div>

      {/* 本地分支 */}
      <div className="branch-selector__section">
        <div className="branch-selector__section-title">
          {t("git.localBranches")}
        </div>
        {localBranches.map((b) => (
          <div
            key={b.name}
            className={`branch-selector__item ${b.is_current ? "branch-selector__item--current" : ""}`}
            onClick={() => handleCheckout(b)}
          >
            <span className="branch-selector__item-name">{b.name}</span>
            {b.is_current && <Check size={14} className="branch-selector__check" />}
            {b.upstream && (
              <span className="branch-selector__upstream">{b.upstream}</span>
            )}
            {!b.is_current && (
              <button
                className="branch-selector__delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(b.name);
                }}
                title={t("git.deleteBranch")}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 远程分支 */}
      {remoteBranches.length > 0 && (
        <div className="branch-selector__section">
          <div className="branch-selector__section-title">
            {t("git.remoteBranches")}
          </div>
          {remoteBranches.map((b) => (
            <div
              key={b.name}
              className="branch-selector__item branch-selector__item--remote"
              onClick={() => handleCheckout(b)}
            >
              <span className="branch-selector__item-name">{b.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* 新建分支 */}
      <div className="branch-selector__create">
        <input
          type="text"
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder={t("git.newBranchPlaceholder")}
          className="branch-selector__create-input"
        />
        <button
          className="btn btn--sm btn--primary"
          onClick={handleCreate}
          disabled={!newBranchName.trim() || operating}
        >
          <Plus size={14} />
          {t("git.createBranch")}
        </button>
      </div>

      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div className="branch-selector__confirm">
          <p>{t("git.deleteBranchConfirm").replace("{name}", confirmDelete)}</p>
          <div className="branch-selector__confirm-actions">
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmDelete(null)}
            >
              {t("confirm.cancel")}
            </button>
            <button
              className="btn btn--sm btn--danger"
              onClick={() => handleDelete(confirmDelete, false)}
            >
              {t("confirm.delete")}
            </button>
            <button
              className="btn btn--sm btn--danger"
              onClick={() => handleDelete(confirmDelete, true)}
              title={t("git.branchNotMerged")}
            >
              {t("git.forceDelete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
