import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, FileText } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";
import type { FileSearchResult } from "../../ipc/commands";

const DISPLAY_LIMIT = 50;

export function FileSearchPanel() {
  const { activeProject } = useProjectStore();
  const { openFile } = useFileStore();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [displayCount, setDisplayCount] = useState(DISPLAY_LIMIT);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevProjectRef = useRef<string | null>(null);

  // Clear search when project changes
  useEffect(() => {
    if (activeProject?.path !== prevProjectRef.current) {
      prevProjectRef.current = activeProject?.path ?? null;
      setQuery("");
      setResults([]);
    }
  }, [activeProject?.path]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !activeProject) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await ipc.searchInFiles(activeProject.path, query.trim());
        setResults(res);
        setDisplayCount(DISPLAY_LIMIT);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeProject?.path]);

  const handleResultClick = (result: FileSearchResult) => {
    if (!activeProject) return;
    const absPath = activeProject.path + "/" + result.path;
    openFile(absPath, result.line_number);
  };

  const trimmedQuery = query.trim();

  const visibleResults = useMemo(() => results.slice(0, displayCount), [results, displayCount]);
  const visibleGrouped = useMemo(() => {
    const map = new Map<string, FileSearchResult[]>();
    for (const r of visibleResults) {
      const existing = map.get(r.path);
      if (existing) existing.push(r);
      else map.set(r.path, [r]);
    }
    return map;
  }, [visibleResults]);
  const hasMore = results.length > displayCount;
  const showMore = useCallback(() => setDisplayCount((c) => c + DISPLAY_LIMIT), []);

  return (
    <div className="file-search-panel">
      <div className="file-search-panel__input-wrapper">
        <Search size={14} className="file-search-panel__icon" />
        <input
          className="file-search-panel__input"
          placeholder={t("fileSearch.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {trimmedQuery && !searching && results.length > 0 && (
        <div className="file-search-panel__count">
          {results.length} {t("fileSearch.results")}
        </div>
      )}

      <div className="file-search-panel__results">
        {trimmedQuery && !searching && results.length === 0 && (
          <div className="file-search-panel__empty">
            {t("fileSearch.noResults")}
          </div>
        )}

        {Array.from(visibleGrouped.entries()).map(([filePath, fileResults]) => (
          <div key={filePath} className="file-search-panel__file-group">
            <div className="file-search-panel__file-header">
              <FileText size={12} />
              <span>{filePath}</span>
            </div>
            {fileResults.map((r, i) => (
              <div
                key={`${filePath}-${r.line_number}-${i}`}
                className="file-search-panel__result-item"
                onClick={() => handleResultClick(r)}
              >
                <span className="file-search-panel__line-num">{r.line_number}</span>
                <span className="file-search-panel__line-content">
                  <HighlightText text={r.line_content} query={trimmedQuery} />
                </span>
              </div>
            ))}
          </div>
        ))}

        {hasMore && (
          <button className="file-search-panel__show-more" onClick={showMore}>
            {t("fileSearch.showMore") ?? `Show more (${results.length - displayCount} remaining)`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Highlights all occurrences of `query` (case-insensitive) in `text`. */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  let lastIdx = 0;

  while (lastIdx < text.length) {
    const idx = lower.indexOf(qLower, lastIdx);
    if (idx === -1) {
      parts.push({ text: text.slice(lastIdx), match: false });
      break;
    }
    if (idx > lastIdx) {
      parts.push({ text: text.slice(lastIdx, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), match: true });
    lastIdx = idx + query.length;
  }

  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="file-search-panel__highlight">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
