import { useState, useEffect, useRef, useCallback } from "react";
import { Wand2, Check, X, Download, Trash2 } from "lucide-react";
import { homeDir } from "@tauri-apps/api/path";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";

// optimize-prompt.md 文件内容
const OPTIMIZE_PROMPT_CONTENT = `---
description: Optimize a prompt for better AI understanding (code & data analysis)
argument-hint: [your-prompt]
---

Analyze and optimize the following user prompt for maximum AI comprehension and output quality. The focus domain is **code development** and **data analysis**.

## Input

Original prompt: $ARGUMENTS

## Optimization Process

If the original prompt is too vague or missing critical information (e.g., only 1-3 generic words like "写个爬虫" or "分析数据"), ask the user 2-3 targeted questions to gather necessary context before optimizing. Questions should cover:
- What specific outcome is expected?
- What technology stack or tools to use?
- What data format or source is involved?

If the prompt contains enough information to work with, proceed directly to optimization.

## Optimization Dimensions

Evaluate and enhance the prompt across these 7 dimensions. Only add dimensions that genuinely improve the prompt — do not force all 7 into every optimization:

1. **Role** — Define a specific expert role (e.g., "Act as a senior Python data engineer with 10 years of experience")
2. **Task Objective** — Transform vague goals into specific, measurable outcomes (e.g., "写爬虫" → "Build a Python web scraper using requests + BeautifulSoup to extract product names and prices from [target site], outputting to CSV")
3. **Context** — Add relevant technical context: programming language, framework, runtime version, data format, environment constraints
4. **Constraints** — Specify requirements: error handling, performance, code style, security considerations, compatibility
5. **Output Format** — Define expected deliverable: complete runnable code with comments, modular structure, specific file format
6. **Chain of Thought** — Guide step-by-step reasoning when the task involves complex logic (e.g., "First analyze the data structure, then design the algorithm, finally implement the solution")
7. **Examples** — Include input/output samples when the expected behavior needs clarification

## User Preferences

If \`~/.claude/CLAUDE.md\` exists, read it to incorporate the user's coding preferences, tech stack, and conventions into the optimized prompt.

## Output Format

Present the results in this exact structure:

### 原始 Prompt
> (Display the user's original prompt as-is)

### 分析
Identify specific issues in the original prompt:
- What is ambiguous or unclear?
- What critical information is missing?
- What structural improvements are needed?

(Use bullet points, be specific, not generic)

### 优化后 Prompt

(Output the optimized prompt below. Use English as the primary language for instructions, with Chinese annotations in parentheses where helpful for user understanding. The optimized prompt should be a complete, ready-to-use prompt that can be directly sent to any AI model.)

[The optimized prompt here]

### 改动说明

| 维度 | 改动内容 | 理由 |
|------|---------|------|
| (Dimension) | (What was changed) | (Why it improves the prompt) |

(Only list dimensions that were actually modified)

## Final Step

After presenting the optimized prompt, ask:

"是否直接按优化后的 Prompt 执行？或者需要调整某些部分？"

If the user confirms, execute the optimized prompt immediately in the current conversation.
`;

interface CommandInfo {
  id: string;
  filename: string;
  installed: boolean;
}

export function ClaudeCommandInstaller() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [commands, setCommands] = useState<CommandInfo[]>([
    { id: "optimize-prompt", filename: "optimize-prompt.md", installed: false },
  ]);
  const [operating, setOperating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 获取命令目录路径
  const getCommandsDir = useCallback(async () => {
    const home = await homeDir();
    // homeDir() 可能带或不带尾部 /，统一处理
    const base = home.endsWith("/") ? home.slice(0, -1) : home;
    return `${base}/.claude/commands`;
  }, []);

  // 检测安装状态
  const checkInstalled = useCallback(async () => {
    try {
      const dir = await getCommandsDir();
      const updated = await Promise.all(
        commands.map(async (cmd) => {
          try {
            await ipc.readFileContent(`${dir}/${cmd.filename}`);
            return { ...cmd, installed: true };
          } catch {
            return { ...cmd, installed: false };
          }
        })
      );
      setCommands(updated);
    } catch {
      // homeDir 获取失败，保持默认状态
    }
  }, [getCommandsDir]);

  // 组件挂载时检测一次 + 面板打开时再检测
  useEffect(() => {
    checkInstalled();
  }, []);

  useEffect(() => {
    if (open) {
      checkInstalled();
    }
  }, [open, checkInstalled]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // toast 自动消失
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // 安装命令
  const install = async (cmdId: string) => {
    setOperating(true);
    try {
      const dir = await getCommandsDir();
      let content = "";
      if (cmdId === "optimize-prompt") {
        content = OPTIMIZE_PROMPT_CONTENT;
      }
      const cmd = commands.find((c) => c.id === cmdId);
      if (!cmd) return;
      await ipc.writeFileContent(`${dir}/${cmd.filename}`, content);
      setCommands((prev) =>
        prev.map((c) => (c.id === cmdId ? { ...c, installed: true } : c))
      );
      setToast(t("command.installSuccess"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setToast(`Error: ${msg}`);
    } finally {
      setOperating(false);
    }
  };

  // 卸载命令
  const uninstall = async (cmdId: string) => {
    setOperating(true);
    try {
      const dir = await getCommandsDir();
      const cmd = commands.find((c) => c.id === cmdId);
      if (!cmd) return;
      await ipc.deleteEntry(`${dir}/${cmd.filename}`);
      setCommands((prev) =>
        prev.map((c) => (c.id === cmdId ? { ...c, installed: false } : c))
      );
      setToast(t("command.uninstallSuccess"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setToast(`Error: ${msg}`);
    } finally {
      setOperating(false);
    }
  };

  const anyInstalled = commands.some((c) => c.installed);

  return (
    <div className="command-installer">
      <button
        ref={btnRef}
        className="top-bar__btn"
        onClick={() => setOpen(!open)}
        title={t("command.title")}
        style={{ fontSize: 13, fontWeight: 500, minWidth: 32 }}
      >
        <Wand2
          size={16}
          color={anyInstalled ? "var(--accent)" : "var(--text-secondary)"}
        />
      </button>

      {open && (
        <div className="command-installer__panel" ref={panelRef}>
          <div className="command-installer__header">
            <span className="command-installer__title">
              {t("command.title")}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          <div className="command-installer__body">
            {commands.map((cmd) => (
              <div key={cmd.id} className="command-installer__card">
                <div className="command-installer__card-header">
                  <span className="command-installer__card-name">
                    /{cmd.id}
                  </span>
                  <span
                    className={`command-installer__status ${
                      cmd.installed
                        ? "command-installer__status--installed"
                        : ""
                    }`}
                  >
                    {cmd.installed
                      ? t("command.installed")
                      : t("command.notInstalled")}
                  </span>
                </div>
                <p className="command-installer__card-desc">
                  {t(`command.${camelize(cmd.id)}Desc`)}
                </p>
                <div className="command-installer__card-actions">
                  {cmd.installed ? (
                    <>
                      <button
                        className="btn btn--sm btn--primary"
                        onClick={() => install(cmd.id)}
                        disabled={operating}
                      >
                        <Download size={12} />
                        <span>{t("command.update")}</span>
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => uninstall(cmd.id)}
                        disabled={operating}
                      >
                        <Trash2 size={12} />
                        <span>{t("command.uninstall")}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={() => install(cmd.id)}
                      disabled={operating}
                    >
                      <Download size={12} />
                      <span>{t("command.install")}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="command-installer__hint">{t("command.hint")}</div>
        </div>
      )}

      {toast && (
        <div className="command-installer__toast">
          <Check size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

// 将 kebab-case 转为 camelCase（如 "optimize-prompt" → "optimizePrompt"）
function camelize(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
