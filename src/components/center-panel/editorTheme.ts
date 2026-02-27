import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * 字体大小 Compartment，支持动态调整
 */
export const fontSizeCompartment = new Compartment();

export function editorFontSizeExtension(size: number) {
  return fontSizeCompartment.of(
    EditorView.theme({ "&": { fontSize: size + "px" } })
  );
}

/**
 * 基于 CSS 变量的 CodeMirror 主题，自动适配 14 套主题
 * 注：字体大小由 fontSizeCompartment 动态控制
 */
export const appEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace",
  },
  ".cm-content": {
    caretColor: "var(--text-primary)",
    padding: "8px 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-primary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-alpha, rgba(100, 149, 237, 0.25))",
  },
  ".cm-panels": {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-primary)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(255, 215, 0, 0.3)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(255, 165, 0, 0.4)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "rgba(100, 149, 237, 0.15)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(100, 149, 237, 0.4)",
    outline: "2px solid rgba(100, 149, 237, 0.7)",
    borderRadius: "2px",
    color: "var(--text-primary) !important",
    fontWeight: "bold",
  },
  ".cm-nonmatchingBracket": {
    backgroundColor: "rgba(255, 80, 80, 0.3)",
    outline: "2px solid rgba(255, 80, 80, 0.6)",
    borderRadius: "2px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-muted)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--bg-hover)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "#fff",
  },
});

/**
 * 语法高亮样式 — 使用高饱和度色彩，在深色和浅色主题下都清晰可见
 */
export const appHighlightStyle = HighlightStyle.define([
  // 关键字: 紫色
  { tag: tags.keyword, color: "#c678dd" },
  { tag: tags.controlKeyword, color: "#c678dd" },
  { tag: tags.operatorKeyword, color: "#c678dd" },
  { tag: tags.definitionKeyword, color: "#c678dd" },
  { tag: tags.moduleKeyword, color: "#c678dd" },

  // 注释: 灰绿色 斜体
  { tag: tags.comment, color: "#7f848e", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#7f848e", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#7f848e", fontStyle: "italic" },
  { tag: tags.docComment, color: "#7f848e", fontStyle: "italic" },

  // 字符串: 绿色
  { tag: tags.string, color: "#98c379" },
  { tag: tags.special(tags.string), color: "#98c379" },
  { tag: tags.character, color: "#98c379" },

  // 数字: 橙色
  { tag: tags.number, color: "#d19a66" },
  { tag: tags.integer, color: "#d19a66" },
  { tag: tags.float, color: "#d19a66" },

  // 布尔/null: 橙色
  { tag: tags.bool, color: "#d19a66" },
  { tag: tags.null, color: "#d19a66" },

  // 变量名: 红色
  { tag: tags.variableName, color: "#e06c75" },
  { tag: tags.definition(tags.variableName), color: "#e06c75" },

  // 函数名: 蓝色
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.definition(tags.function(tags.variableName)), color: "#61afef" },

  // 类型: 青色
  { tag: tags.typeName, color: "#56b6c2" },
  { tag: tags.className, color: "#e5c07b" },
  { tag: tags.namespace, color: "#e5c07b" },

  // 属性: 红色
  { tag: tags.propertyName, color: "#e06c75" },
  { tag: tags.definition(tags.propertyName), color: "#e06c75" },
  { tag: tags.special(tags.propertyName), color: "#e06c75" },

  // 标签 (HTML/XML): 红色
  { tag: tags.tagName, color: "#e06c75" },
  { tag: tags.attributeName, color: "#d19a66" },
  { tag: tags.attributeValue, color: "#98c379" },

  // 操作符: 青色
  { tag: tags.operator, color: "#56b6c2" },
  { tag: tags.compareOperator, color: "#56b6c2" },
  { tag: tags.arithmeticOperator, color: "#56b6c2" },
  { tag: tags.logicOperator, color: "#56b6c2" },

  // 标点: 主文字色
  { tag: tags.punctuation, color: "#abb2bf" },
  { tag: tags.bracket, color: "#abb2bf" },
  { tag: tags.squareBracket, color: "#abb2bf" },
  { tag: tags.paren, color: "#abb2bf" },
  { tag: tags.brace, color: "#abb2bf" },
  { tag: tags.angleBracket, color: "#abb2bf" },

  // 正则: 橙色
  { tag: tags.regexp, color: "#d19a66" },

  // 转义字符: 青色
  { tag: tags.escape, color: "#56b6c2" },

  // 元信息/注解: 黄色
  { tag: tags.meta, color: "#e5c07b" },
  { tag: tags.annotation, color: "#e5c07b" },

  // 链接: 蓝色 下划线
  { tag: tags.link, color: "#61afef", textDecoration: "underline" },
  { tag: tags.url, color: "#61afef" },

  // 标题 (Markdown): 红色 加粗
  { tag: tags.heading, color: "#e06c75", fontWeight: "bold" },
  { tag: tags.heading1, color: "#e06c75", fontWeight: "bold" },
  { tag: tags.heading2, color: "#e06c75", fontWeight: "bold" },

  // 强调 (Markdown)
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },

  // 行内代码
  { tag: tags.monospace, color: "#98c379" },

  // 自身 (self/this): 红色 斜体
  { tag: tags.self, color: "#e06c75", fontStyle: "italic" },

  // 标签: 蓝色
  { tag: tags.labelName, color: "#61afef" },
]);
