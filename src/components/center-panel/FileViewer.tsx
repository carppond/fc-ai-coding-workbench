import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, Copy, Check, Save, Eye, Code } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useFileStore } from "../../stores/fileStore";
import { useI18n } from "../../lib/i18n";

import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting as cmSyntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

import { appEditorTheme, appHighlightStyle, fontSizeCompartment, editorFontSizeExtension } from "./editorTheme";
import { getLanguageExtension } from "./editorLanguages";
import { useSettingsStore } from "../../stores/settingsStore";

export function FileViewer() {
  const openFilePath = useFileStore((s) => s.openFilePath);
  const openFileContent = useFileStore((s) => s.openFileContent);
  const openFileError = useFileStore((s) => s.openFileError);
  const openFileLine = useFileStore((s) => s.openFileLine);
  const isDirty = useFileStore((s) => s.isDirty);
  const saving = useFileStore((s) => s.saving);
  const closeFile = useFileStore((s) => s.closeFile);
  const markDirty = useFileStore((s) => s.markDirty);
  const saveFile = useFileStore((s) => s.saveFile);
  const { t } = useI18n();
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);

  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
  const MD_EXTS = new Set(["md", "markdown"]);
  const fileExt = useMemo(() => openFilePath?.split(".").pop()?.toLowerCase() || "", [openFilePath]);
  const isImage = useMemo(() => IMAGE_EXTS.has(fileExt), [fileExt]);
  const isMd = useMemo(() => MD_EXTS.has(fileExt), [fileExt]);
  const [previewMode, setPreviewMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // 跟踪编辑器创建时的文件路径，用于识别文件切换
  const editorFileRef = useRef<string | null>(null);
  // 原始内容引用，用于脏状态判断
  const originalContentRef = useRef("");

  // 保存回调（保持最新引用，供 keymap 使用）
  const saveCallbackRef = useRef<() => void>(() => {});
  saveCallbackRef.current = useCallback(() => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    saveFile(content).then((ok) => {
      if (ok) {
        originalContentRef.current = content;
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }, [saveFile]);

  // 文件切换时重置预览模式
  const prevFileRef = useRef(openFilePath);
  useEffect(() => {
    if (openFilePath !== prevFileRef.current) {
      setPreviewMode(false);
      prevFileRef.current = openFilePath;
    }
  }, [openFilePath]);

  // 创建/更新编辑器
  useEffect(() => {
    if (!containerRef.current || !openFilePath || openFileContent === null) return;

    // 如果编辑器已存在且是同一个文件，跳过重建
    if (viewRef.current && editorFileRef.current === openFilePath) return;

    // 销毁旧编辑器
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    editorFileRef.current = openFilePath;
    originalContentRef.current = openFileContent ?? "";

    // 异步加载语言扩展
    const setup = async () => {
      const langExt = await getLanguageExtension(openFilePath);

      const extensions: Extension[] = [];

      // 语言扩展放在最前面，确保语法树先于括号匹配可用
      if (langExt) {
        extensions.push(langExt);
      }

      extensions.push(
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        cmSyntaxHighlighting(appHighlightStyle),
        bracketMatching({ brackets: "()[]{}",  afterCursor: true }),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
          // Cmd+S / Ctrl+S 保存
          {
            key: "Mod-s",
            run: () => {
              saveCallbackRef.current();
              return true;
            },
          },
        ]),
        // 监听内容变化，更新脏状态
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            const dirty = newContent !== originalContentRef.current;
            markDirty(dirty);
          }
        }),
        appEditorTheme,
        editorFontSizeExtension(useSettingsStore.getState().editorFontSize),
      );

      const state = EditorState.create({
        doc: openFileContent ?? "",
        extensions,
      });

      if (!containerRef.current) return;

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      // 滚动到指定行
      if (openFileLine && openFileLine > 0) {
        const line = Math.min(openFileLine, view.state.doc.lines);
        const lineInfo = view.state.doc.line(line);
        view.dispatch({
          effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
          selection: { anchor: lineInfo.from },
        });
      }
    };

    setup();

    return () => {
      // 组件卸载时清理
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
        editorFileRef.current = null;
      }
    };
  }, [openFilePath, openFileContent, openFileLine, markDirty]);

  // 动态更新编辑器字体大小
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: fontSizeCompartment.reconfigure(
          EditorView.theme({ "&": { fontSize: editorFontSize + "px" } })
        ),
      });
    }
  }, [editorFontSize]);

  const handleCopyPath = async () => {
    if (!openFilePath) return;
    try {
      await navigator.clipboard.writeText(openFilePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleSave = () => {
    saveCallbackRef.current();
  };

  if (!openFilePath) return null;

  return (
    <div className="file-viewer">
      <div className="file-viewer__header">
        <span className="file-viewer__path" title={openFilePath}>
          {openFilePath}
        </span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
          {saved && (
            <span style={{ fontSize: 11, color: "var(--success)" }}>
              {t("fileViewer.saved")}
            </span>
          )}
          {isMd && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setPreviewMode((v) => !v)}
              title={previewMode ? t("fileViewer.edit") : t("fileViewer.preview")}
            >
              {previewMode ? <Code size={13} /> : <Eye size={13} />}
            </button>
          )}
          {!isImage && !previewMode && isDirty && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleSave}
              disabled={saving}
              title={t("fileViewer.save")}
            >
              <Save size={13} />
            </button>
          )}
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
      {openFileError ? (
        <div className="file-viewer__error">
          <span>{openFileError}</span>
        </div>
      ) : isImage ? (
        <div className="file-viewer__image-container">
          <img
            src={convertFileSrc(openFilePath)}
            alt={openFilePath.split("/").pop() || ""}
            className="file-viewer__image"
          />
        </div>
      ) : (
        <>
          {isMd && previewMode && (
            <div className="md-preview">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {(viewRef.current?.state.doc.toString() ?? openFileContent) || ""}
              </ReactMarkdown>
            </div>
          )}
          <div
            className="file-viewer__editor"
            ref={containerRef}
            style={{ display: isMd && previewMode ? "none" : undefined }}
          />
        </>
      )}
    </div>
  );
}

