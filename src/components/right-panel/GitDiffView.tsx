import { useMemo, useState } from "react";
import { Send, X, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useI18n } from "../../lib/i18n";

const MAX_DIFF_LINES = 3000;

interface GitDiffViewProps {
  onSendToAI?: (text: string) => void;
}

export function GitDiffView({ onSendToAI }: GitDiffViewProps) {
  const diffText = useGitStore((s) => s.diffText);
  const diffStagedText = useGitStore((s) => s.diffStagedText);
  const selectedFile = useGitStore((s) => s.selectedFile);
  const selectedFileDiff = useGitStore((s) => s.selectedFileDiff);
  const clearSelectedFile = useGitStore((s) => s.clearSelectedFile);
  const { t } = useI18n();
  const [tab, setTab] = useState<"workdir" | "staged">("workdir");
  const [collapsed, setCollapsed] = useState(false);

  // If a file is selected, show its diff; otherwise show the full diff for the active tab
  const isFileSelected = selectedFile !== null;
  const diffContent = isFileSelected
    ? selectedFileDiff
    : tab === "workdir"
      ? diffText
      : diffStagedText;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: collapsed ? "0 0 auto" : 1, minHeight: 0 }}>
      <div className="git-collapsible-bar">
        <button
          className="git-collapsible-bar__toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {isFileSelected ? (
          <>
            <span
              style={{
                fontSize: 11,
                fontFamily: '"SF Mono", monospace',
                color: "var(--text-secondary)",
                padding: "4px 8px",
                background: "var(--accent-dim)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 200,
              }}
            >
              {selectedFile.path}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: "var(--radius-xl)",
                fontWeight: 600,
                background: selectedFile.staged ? "var(--success-dim)" : "var(--bg-surface)",
                color: selectedFile.staged ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {selectedFile.staged ? t("git.staged") : t("git.workdir")}
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn--ghost btn--sm"
              onClick={clearSelectedFile}
              title="Show all"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              className={`btn btn--sm ${tab === "workdir" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setTab("workdir")}
            >
              {t("git.workdir")}
            </button>
            <button
              className={`btn btn--sm ${tab === "staged" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setTab("staged")}
            >
              {t("git.staged")}
            </button>
            <div style={{ flex: 1 }} />
            {onSendToAI && diffContent && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => onSendToAI(`\`\`\`diff\n${diffContent}\n\`\`\``)}
                title="Send diff to AI chat"
              >
                <Send size={12} /> {t("git.toAI")}
              </button>
            )}
          </>
        )}
      </div>
      {!collapsed && (
        <div className="git-diff-view">
          {diffContent ? (
            <DiffLines content={diffContent} />
          ) : (
            <div style={{ color: "var(--text-muted)", padding: 16 }}>
              {t("git.noDiff")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FileBlock {
  header: string;
  lines: DiffLine[];
  rawText: string;
}

interface DiffLine {
  type: "add" | "del" | "hunk" | "header" | "context";
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

function parseFileBlocks(content: string): FileBlock[] {
  const allLines = content.split("\n");
  const blocks: FileBlock[] = [];
  let currentBlock: { header: string; rawLines: string[]; lines: DiffLine[] } | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of allLines) {
    if (line.startsWith("diff --git")) {
      if (currentBlock) {
        blocks.push({
          header: currentBlock.header,
          lines: currentBlock.lines,
          rawText: currentBlock.rawLines.join("\n"),
        });
      }
      currentBlock = { header: line, rawLines: [line], lines: [] };
      oldLine = 0;
      newLine = 0;
      continue;
    }

    if (!currentBlock) {
      // Lines before any file block — create a default block
      currentBlock = { header: "diff", rawLines: [line], lines: [] };
    } else {
      currentBlock.rawLines.push(line);
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentBlock.lines.push({
        type: "hunk",
        content: line,
        oldLineNum: null,
        newLineNum: null,
      });
      continue;
    }

    // Skip metadata lines (---, +++, index, etc.)
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("similarity") || line.startsWith("rename") || line.startsWith("old mode") || line.startsWith("new mode")) {
      currentBlock.lines.push({
        type: "header",
        content: line,
        oldLineNum: null,
        newLineNum: null,
      });
      continue;
    }

    if (line.startsWith("+")) {
      currentBlock.lines.push({
        type: "add",
        content: line,
        oldLineNum: null,
        newLineNum: newLine,
      });
      newLine++;
    } else if (line.startsWith("-")) {
      currentBlock.lines.push({
        type: "del",
        content: line,
        oldLineNum: oldLine,
        newLineNum: null,
      });
      oldLine++;
    } else {
      currentBlock.lines.push({
        type: "context",
        content: line,
        oldLineNum: oldLine || null,
        newLineNum: newLine || null,
      });
      if (oldLine) oldLine++;
      if (newLine) newLine++;
    }
  }

  if (currentBlock) {
    blocks.push({
      header: currentBlock.header,
      lines: currentBlock.lines,
      rawText: currentBlock.rawLines.join("\n"),
    });
  }

  return blocks;
}

function DiffLines({ content }: { content: string }) {
  const { t } = useI18n();

  const { blocks, truncated, totalCount } = useMemo(() => {
    const allLines = content.split("\n");
    const total = allLines.length;
    const text = total > MAX_DIFF_LINES
      ? allLines.slice(0, MAX_DIFF_LINES).join("\n")
      : content;
    return {
      blocks: parseFileBlocks(text),
      truncated: total > MAX_DIFF_LINES,
      totalCount: total,
    };
  }, [content]);

  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());

  const toggleCollapse = (idx: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // If there's only one block and it doesn't start with "diff --git", render simply
  if (blocks.length <= 1 && !content.startsWith("diff --git")) {
    return <SimpleDiffLines content={content} />;
  }

  return (
    <>
      <div className="git-diff-file-summary">
        {blocks.length} {t("git.filesChanged")}
      </div>
      {blocks.map((block, idx) => {
        const isCollapsed = collapsedFiles.has(idx);
        // Extract file name from header
        const fileMatch = block.header.match(/diff --git a\/(.+?) b\//);
        const fileName = fileMatch ? fileMatch[1] : block.header;
        const blockKey = fileName + "-" + idx;

        return (
          <div key={blockKey} className="git-diff-file-block">
            <div className="git-diff-file-block__header" onClick={() => toggleCollapse(idx)}>
              <span className="git-diff-file-block__chevron">
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
              <span className="git-diff-file-block__name">{fileName}</span>
              <CopyButton text={block.rawText} />
            </div>
            {!isCollapsed && (
              <table className="git-diff-table">
                <tbody>
                  {block.lines.map((line, i) => {
                    let className = "";
                    if (line.type === "add") className = "git-diff-view__line--add";
                    else if (line.type === "del") className = "git-diff-view__line--del";
                    else if (line.type === "hunk") className = "git-diff-view__line--hunk";
                    else if (line.type === "header") className = "git-diff-view__line--file-header";

                    return (
                      <tr key={i} className={className}>
                        <td className="git-diff-table__line-num">
                          {line.oldLineNum ?? ""}
                        </td>
                        <td className="git-diff-table__line-num">
                          {line.newLineNum ?? ""}
                        </td>
                        <td className="git-diff-table__content">{line.content}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {truncated && (
        <div style={{ color: "var(--warning)", padding: "12px 0", fontStyle: "italic" }}>
          ... {totalCount - MAX_DIFF_LINES} lines truncated (total {totalCount} lines)
        </div>
      )}
    </>
  );
}

function SimpleDiffLines({ content }: { content: string }) {
  const lines = useMemo(() => content.split("\n"), [content]);

  return (
    <>
      {lines.map((line, i) => {
        let className = "";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          className = "git-diff-view__line--add";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          className = "git-diff-view__line--del";
        } else if (line.startsWith("@@")) {
          className = "git-diff-view__line--hunk";
        }
        return (
          <div key={i} className={className}>{line}</div>
        );
      })}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      className="btn btn--ghost btn--sm git-diff-file-block__copy"
      onClick={handleCopy}
      title={t("git.copyDiff")}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? t("git.copied") : t("git.copyDiff")}
    </button>
  );
}
