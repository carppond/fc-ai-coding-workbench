import { Diff, File, FolderTree, GitCommitHorizontal } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../stores/projectStore";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";

interface ContextInjectBarProps {
  onInject: (text: string) => void;
}

export function ContextInjectBar({ onInject }: ContextInjectBarProps) {
  const { activeProject } = useProjectStore();
  const { loadDiff, loadDiffStaged } = useGitStore();
  const { t } = useI18n();

  const handleInsertDiff = async () => {
    if (!activeProject) return;
    await loadDiff(activeProject.path);
    const diff = useGitStore.getState().diffText;
    if (diff) {
      onInject(`\n\`\`\`diff\n${diff}\n\`\`\`\n`);
    }
  };

  const handleInsertStagedDiff = async () => {
    if (!activeProject) return;
    await loadDiffStaged(activeProject.path);
    const diff = useGitStore.getState().diffStagedText;
    if (diff) {
      onInject(`\n\`\`\`diff\n${diff}\n\`\`\`\n`);
    }
  };

  const handleInsertFile = async () => {
    if (!activeProject) return;
    const selected = await open({
      defaultPath: activeProject.path,
      multiple: false,
    });
    if (!selected) return;
    try {
      const content = await ipc.readFileContent(selected as string);
      const name = (selected as string).split("/").pop() || "";
      onInject(`\n**${name}:**\n\`\`\`\n${content}\n\`\`\`\n`);
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  };

  const handleInsertDirTree = async () => {
    if (!activeProject) return;
    try {
      const tree = await ipc.readDirectoryTree(activeProject.path, 2);
      const formatted = formatTree(tree, 0);
      onInject(`\n\`\`\`\n${formatted}\`\`\`\n`);
    } catch (e) {
      console.error("Failed to read directory:", e);
    }
  };

  return (
    <div className="context-bar">
      <button
        className="context-bar__btn"
        onClick={handleInsertDiff}
        title="Insert working directory diff"
      >
        <Diff size={11} /> {t("context.diff")}
      </button>
      <button
        className="context-bar__btn"
        onClick={handleInsertStagedDiff}
        title="Insert staged diff"
      >
        <GitCommitHorizontal size={11} /> {t("context.staged")}
      </button>
      <button
        className="context-bar__btn"
        onClick={handleInsertFile}
        title="Insert file content"
      >
        <File size={11} /> {t("context.file")}
      </button>
      <button
        className="context-bar__btn"
        onClick={handleInsertDirTree}
        title="Insert directory tree"
      >
        <FolderTree size={11} /> {t("context.tree")}
      </button>
    </div>
  );
}

function formatTree(entries: { name: string; is_dir: boolean; children?: unknown[] | null }[], depth: number): string {
  let result = "";
  for (const entry of entries) {
    const indent = "  ".repeat(depth);
    const prefix = entry.is_dir ? "📁 " : "📄 ";
    result += `${indent}${prefix}${entry.name}\n`;
    if (entry.is_dir && entry.children && Array.isArray(entry.children)) {
      result += formatTree(entry.children as typeof entries, depth + 1);
    }
  }
  return result;
}
