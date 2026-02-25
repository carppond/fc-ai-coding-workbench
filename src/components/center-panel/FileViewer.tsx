import { useMemo, useEffect, useRef } from "react";
import { X, Copy, Check } from "lucide-react";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import { useState } from "react";

const MAX_LINES = 5000;

// Language detection by file extension
type LangType = "js" | "rust" | "python" | "css" | "html" | "json" | "markdown" | "plain";

const EXT_MAP: Record<string, LangType> = {
  js: "js", jsx: "js", ts: "js", tsx: "js", mjs: "js", cjs: "js",
  rs: "rust", toml: "rust",
  py: "python", pyw: "python",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html", xml: "html", svg: "html",
  json: "json",
  md: "markdown", mdx: "markdown",
};

function detectLang(filePath: string): LangType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plain";
}

// Lightweight keyword-based syntax coloring
const KEYWORD_PATTERNS: Record<LangType, { pattern: RegExp; className: string }[]> = {
  js: [
    { pattern: /(\/\/.*$)/gm, className: "syn-comment" },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, className: "syn-string" },
    { pattern: /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|async|await|try|catch|throw|typeof|instanceof|interface|type|enum|default|switch|case|break|continue|null|undefined|true|false|void)\b/g, className: "syn-keyword" },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "syn-number" },
  ],
  rust: [
    { pattern: /(\/\/.*$)/gm, className: "syn-comment" },
    { pattern: /("(?:[^"\\]|\\.)*")/g, className: "syn-string" },
    { pattern: /\b(fn|let|mut|pub|use|mod|struct|enum|impl|trait|where|for|while|loop|if|else|match|return|self|Self|super|crate|async|await|move|ref|true|false|type|const|static|unsafe|extern)\b/g, className: "syn-keyword" },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "syn-number" },
  ],
  python: [
    { pattern: /(#.*$)/gm, className: "syn-comment" },
    { pattern: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: "syn-string" },
    { pattern: /\b(def|class|import|from|return|if|elif|else|for|while|with|as|try|except|finally|raise|pass|break|continue|and|or|not|is|in|None|True|False|lambda|yield|global|nonlocal|async|await)\b/g, className: "syn-keyword" },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "syn-number" },
  ],
  css: [
    { pattern: /(\/\*[\s\S]*?\*\/)/g, className: "syn-comment" },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: "syn-string" },
    { pattern: /(#[0-9a-fA-F]{3,8})\b/g, className: "syn-number" },
    { pattern: /\b(\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?)\b/g, className: "syn-number" },
  ],
  html: [
    { pattern: /(<!--[\s\S]*?-->)/g, className: "syn-comment" },
    { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: "syn-string" },
    { pattern: /(<\/?[a-zA-Z][a-zA-Z0-9-]*)/g, className: "syn-keyword" },
  ],
  json: [
    { pattern: /("(?:[^"\\]|\\.)*")\s*:/g, className: "syn-keyword" },
    { pattern: /:\s*("(?:[^"\\]|\\.)*")/g, className: "syn-string" },
    { pattern: /\b(true|false|null)\b/g, className: "syn-keyword" },
    { pattern: /\b(\d+\.?\d*)\b/g, className: "syn-number" },
  ],
  markdown: [
    { pattern: /^(#{1,6}\s.*)$/gm, className: "syn-keyword" },
    { pattern: /(`[^`]+`)/g, className: "syn-string" },
    { pattern: /(\*\*[^*]+\*\*|__[^_]+__)/g, className: "syn-keyword" },
  ],
  plain: [],
};

function highlightLine(line: string, lang: LangType): (string | { text: string; cls: string })[] {
  const patterns = KEYWORD_PATTERNS[lang];
  if (!patterns.length) return [line];

  // Build an array of segments with their positions
  const segments: { start: number; end: number; cls: string }[] = [];

  for (const { pattern, className } of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      // Use the first capture group if available, otherwise the full match
      const matchText = m[1] ?? m[0];
      const start = m.index + (m[1] ? m[0].indexOf(m[1]) : 0);
      const end = start + matchText.length;
      // Only add if no overlap with existing
      const overlaps = segments.some(
        (s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end)
      );
      if (!overlaps) {
        segments.push({ start, end, cls: className });
      }
    }
  }

  if (!segments.length) return [line];

  // Sort by position
  segments.sort((a, b) => a.start - b.start);

  const result: (string | { text: string; cls: string })[] = [];
  let pos = 0;
  for (const seg of segments) {
    if (seg.start > pos) {
      result.push(line.slice(pos, seg.start));
    }
    result.push({ text: line.slice(seg.start, seg.end), cls: seg.cls });
    pos = seg.end;
  }
  if (pos < line.length) {
    result.push(line.slice(pos));
  }
  return result;
}

export function FileViewer() {
  const { openFilePath, openFileContent, openFileLine, closeFile } = useFileStore();
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const { lines, truncated } = useMemo(() => {
    if (!openFileContent) return { lines: [] as string[], truncated: false };
    const all = openFileContent.split("\n");
    if (all.length <= MAX_LINES) {
      return { lines: all, truncated: false };
    }
    return { lines: all.slice(0, MAX_LINES), truncated: true };
  }, [openFileContent]);

  const lang = useMemo(() => {
    return openFilePath ? detectLang(openFilePath) : "plain" as LangType;
  }, [openFilePath]);

  // Scroll to target line when content loads
  useEffect(() => {
    if (!openFileLine || !openFileContent || !contentRef.current) return;
    const row = contentRef.current.querySelector(`#line-${openFileLine}`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.classList.add("file-viewer__line--highlight");
      const timer = setTimeout(() => row.classList.remove("file-viewer__line--highlight"), 3000);
      return () => clearTimeout(timer);
    }
  }, [openFileLine, openFileContent]);

  const handleCopyPath = async () => {
    if (!openFilePath) return;
    try {
      await navigator.clipboard.writeText(openFilePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  if (!openFilePath) return null;

  return (
    <div className="file-viewer">
      <div className="file-viewer__header">
        <span className="file-viewer__path" title={openFilePath}>
          {openFilePath}
        </span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleCopyPath}
            title="Copy path"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={closeFile}
            title={t("fileViewer.close")}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {truncated && (
        <div className="file-viewer__warning">
          {t("fileViewer.tooLarge").replace("{lines}", String(MAX_LINES))}
        </div>
      )}
      <div className="file-viewer__content" ref={contentRef}>
        <pre className="file-viewer__pre">
          <table className="file-viewer__table">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} id={`line-${i + 1}`}>
                  <td className="file-viewer__line-number">{i + 1}</td>
                  <td className="file-viewer__line-content">
                    <SyntaxLine line={line || " "} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </pre>
      </div>
    </div>
  );
}

function SyntaxLine({ line, lang }: { line: string; lang: LangType }) {
  const parts = useMemo(() => highlightLine(line, lang), [line, lang]);

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className={p.cls}>{p.text}</span>
        )
      )}
    </>
  );
}
