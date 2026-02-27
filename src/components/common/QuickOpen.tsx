import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, FileText } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";

interface QuickOpenProps {
  visible: boolean;
  onClose: () => void;
}

/** 模糊匹配：按字符顺序匹配，返回匹配分数（越低越好），-1 表示不匹配 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // 连续匹配得分更高（score 更低）
      score += lastIndex === ti - 1 ? 0 : (ti - lastIndex);
      lastIndex = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1; // 未完全匹配
  return score;
}

const MAX_RESULTS = 20;

export function QuickOpen({ visible, onClose }: QuickOpenProps) {
  const activeProject = useProjectStore((s) => s.activeProject);
  const openFile = useFileStore((s) => s.openFile);
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载文件列表
  useEffect(() => {
    if (visible && activeProject) {
      ipc.listAllFiles(activeProject.path).then(setFiles).catch(() => setFiles([]));
    }
  }, [visible, activeProject]);

  // 自动聚焦
  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  // 过滤结果
  const results = useMemo(() => {
    if (!query.trim()) {
      // 无查询时显示最近文件（前20个）
      return files.slice(0, MAX_RESULTS).map((path) => ({ path, score: 0 }));
    }
    const scored: { path: string; score: number }[] = [];
    for (const path of files) {
      // 对文件名和完整路径分别匹配，文件名匹配优先
      const fileName = path.split("/").pop() || path;
      const nameScore = fuzzyMatch(query, fileName);
      const pathScore = fuzzyMatch(query, path);
      const best = nameScore >= 0
        ? (pathScore >= 0 ? Math.min(nameScore, pathScore + 1000) : nameScore)
        : pathScore;
      if (best >= 0) {
        scored.push({ path, score: best });
      }
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_RESULTS);
  }, [query, files]);

  // 重置选中项
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll(".quick-open__item");
      items[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (path: string) => {
      if (!activeProject) return;
      const fullPath = activeProject.path + "/" + path;
      openFile(fullPath);
      onClose();
    },
    [activeProject, openFile, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex].path);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  if (!visible) return null;

  return (
    <div className="quick-open__overlay" onClick={onClose}>
      <div className="quick-open" onClick={(e) => e.stopPropagation()}>
        <div className="quick-open__input-wrapper">
          <Search size={16} className="quick-open__search-icon" />
          <input
            ref={inputRef}
            className="quick-open__input"
            type="text"
            placeholder={t("quickOpen.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="quick-open__list" ref={listRef}>
          {results.length === 0 ? (
            <div className="quick-open__empty">{t("quickOpen.noResults")}</div>
          ) : (
            results.map((item, index) => {
              const fileName = item.path.split("/").pop() || item.path;
              const dirPath = item.path.includes("/")
                ? item.path.substring(0, item.path.lastIndexOf("/"))
                : "";
              return (
                <div
                  key={item.path}
                  className={`quick-open__item ${index === selectedIndex ? "quick-open__item--selected" : ""}`}
                  onClick={() => handleSelect(item.path)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <FileText size={14} className="quick-open__file-icon" />
                  <span className="quick-open__file-name">{fileName}</span>
                  {dirPath && (
                    <span className="quick-open__file-path">{dirPath}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
