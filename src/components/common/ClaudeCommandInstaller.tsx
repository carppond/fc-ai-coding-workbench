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

// code-review.md 文件内容
const CODE_REVIEW_CONTENT = `---
description: Review code for bugs, performance, security and best practices
argument-hint: [file-path or code-description]
allowed-tools: Read, Grep, Glob
---

Perform a thorough code review on the specified target.

## Input

Review target: $ARGUMENTS

## Review Process

1. If the input is a file path (e.g., \`src/api/auth.ts\`), read the file first
2. If the input is a directory path, use Glob to find relevant source files, then review each
3. If the input is a description, ask the user to provide the file path or paste the code

## Review Dimensions

Evaluate the code across these 5 dimensions. Skip any dimension that has no issues:

### 1. Bugs & Logic Errors (缺陷与逻辑错误)
- Off-by-one errors, null/undefined handling, race conditions
- Incorrect conditionals, missing edge cases
- Type mismatches, wrong return values

### 2. Security (安全问题)
- Injection risks: SQL injection, XSS, command injection
- Authentication/authorization flaws
- Sensitive data exposure (hardcoded secrets, logging PII)
- Insecure dependencies or configurations

### 3. Performance (性能问题)
- Unnecessary loops, redundant computations
- Memory leaks, unoptimized queries
- Missing caching opportunities
- N+1 query problems

### 4. Code Quality (代码质量)
- Readability: unclear naming, overly complex logic
- Maintainability: duplicated code, tight coupling
- Missing error handling at system boundaries
- Dead code, unused imports/variables

### 5. Best Practices (最佳实践)
- Framework/language idioms not followed
- Anti-patterns in use
- Missing input validation at boundaries
- Inconsistent patterns within the codebase

## Output Format

Present the review in this structure:

### 概览
(1-2 sentence summary: overall code quality assessment and most critical finding)

### 问题列表

For each issue found:

**[severity] file:line — Brief description**
(severity: CRITICAL / WARNING / SUGGESTION)

(Show the problematic code snippet)

**Problem (问题):** What is wrong and why it matters
**Fix (修复建议):**
(Show the corrected code)

---

(Repeat for each issue, ordered by severity: CRITICAL first, then WARNING, then SUGGESTION)

### 总结

| 维度 | 问题数 | 最高严重度 |
|------|--------|-----------|
| Bugs | N | CRITICAL/WARNING/SUGGESTION/None |
| Security | N | ... |
| Performance | N | ... |
| Code Quality | N | ... |
| Best Practices | N | ... |

## Guidelines

- Be specific: always reference exact line numbers and code snippets
- Be actionable: every issue must include a concrete fix
- Be proportional: do not nitpick style issues if there are real bugs
- Respect existing patterns: do not suggest rewriting the entire file
- If the code is solid, say so — do not invent problems
`;

// debug.md 文件内容
const DEBUG_CONTENT = `---
description: Analyze error messages and locate root cause
argument-hint: [error-message or file-path]
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

Analyze the provided error and locate the root cause.

## Input

Error info: $ARGUMENTS

## Debug Process

1. If the input is an error message or stack trace, parse it to identify:
   - Error type and message
   - File path and line number from stack trace
   - The call chain that led to the error

2. If the input is a file path, read the file and ask the user to describe the error or unexpected behavior

3. If the input is vague (e.g., "页面打不开"), ask the user:
   - What is the exact error message or behavior?
   - When does it occur? (build time, runtime, specific action)
   - What changed recently? (new code, dependency update, config change)

## Analysis Dimensions

### 1. Error Identification (错误识别)
- Parse error type: syntax, runtime, type, network, logic
- Identify the exact failing line and function
- Read the relevant source file(s)

### 2. Root Cause Analysis (根因分析)
- Trace the error origin through the call stack
- Check for common causes:
  - Null/undefined access
  - Type mismatch
  - Missing import/dependency
  - Incorrect API usage
  - Environment/configuration issue
  - Async/timing issue
  - Version incompatibility

### 3. Context Investigation (上下文排查)
- Check related files (imports, dependencies, configs)
- Look for recent changes: git log --oneline -10 and git diff on relevant files
- Verify dependency versions if relevant

## Output Format

### 错误摘要
(One sentence: what error, where it happens)

### 根因分析

**Error type (错误类型):** (e.g., TypeError, SyntaxError, NetworkError)
**Location (位置):** file:line
**Root cause (根因):**
(Clear explanation of why this error occurs, referencing specific code)

(Show the problematic code with the issue highlighted)

### 修复方案

**Recommended fix (推荐修复):**
(Show the corrected code, ready to apply)

**Why this fixes it (原因):**
(Brief explanation of why the fix works)

### 预防建议
(1-2 actionable suggestions to prevent similar errors, only if genuinely useful. Skip this section if the error is a simple typo or one-off mistake.)

## Guidelines

- Start from the error message, not assumptions
- Read actual source code before suggesting fixes
- Provide the simplest fix that solves the problem
- Do not refactor or "improve" unrelated code
- If multiple possible causes exist, list them ranked by likelihood
`;

// gen-tests.md 文件内容
const GEN_TESTS_CONTENT = `---
description: Generate unit tests for the specified file or function
argument-hint: [file-path]
allowed-tools: Read, Grep, Glob
---

Generate comprehensive unit tests for the specified target.

## Input

Test target: $ARGUMENTS

## Process

1. If the input is a file path, read the file to understand all exported functions/classes/methods
2. If the input is a function name, use Grep to locate it, then read the file
3. If no input provided, ask the user to specify the file or function to test

## Test Generation Steps

### Step 1: Analyze the Code (分析代码)
- Identify all public functions, methods, and classes
- Understand input types, return types, and side effects
- Map out dependencies and external calls
- Note edge cases and boundary conditions

### Step 2: Detect Test Environment (检测测试环境)
- Check the project for existing test framework:
  - Look for jest.config.*, vitest.config.*, pytest.ini, pyproject.toml, .mocharc.*, karma.conf.*
  - Check package.json for test scripts and devDependencies
  - Check existing test files for patterns and conventions
- If no test framework found, ask the user which framework to use
- Follow existing test file naming conventions (e.g., *.test.ts, *.spec.ts, *_test.py)

### Step 3: Generate Tests (生成测试)
For each function/method, generate tests covering:

1. **Happy path (正常路径)** — Normal inputs, expected outputs
2. **Edge cases (边界情况)** — Empty input, null/undefined, zero, max values, empty arrays/strings
3. **Error cases (错误情况)** — Invalid input types, missing required params, API failures
4. **Boundary conditions (边界条件)** — Off-by-one, type coercion, precision issues

## Output Format

### 分析

**Target (目标):** file-path — N functions/methods identified
**Test framework (测试框架):** Jest / Vitest / pytest / etc.
**Test file (测试文件):** suggested-test-file-path

| Function | Happy Path | Edge Cases | Error Cases | Total |
|----------|-----------|------------|-------------|-------|
| funcA    | N         | N          | N           | N     |
| funcB    | N         | N          | N           | N     |

### 测试代码

(Output the complete test file, ready to save and run. Include all necessary imports, mock setup, and teardown.)

[Complete test code here]

### 运行方式

(Show the exact command to run these tests)

## Guidelines

- Match the project's existing test style and conventions
- Use descriptive test names that explain the expected behavior
- Mock external dependencies (API calls, database, file system), do not mock the function under test
- Each test should be independent — no shared mutable state
- Keep tests focused: one assertion per logical concept
- Do not test private/internal implementation details
- If the function is pure, prefer simple input/output assertions
- If the function has side effects, verify the side effects
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
    { id: "code-review", filename: "code-review.md", installed: false },
    { id: "debug", filename: "debug.md", installed: false },
    { id: "gen-tests", filename: "gen-tests.md", installed: false },
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
      const contentMap: Record<string, string> = {
        "optimize-prompt": OPTIMIZE_PROMPT_CONTENT,
        "code-review": CODE_REVIEW_CONTENT,
        "debug": DEBUG_CONTENT,
        "gen-tests": GEN_TESTS_CONTENT,
      };
      const content = contentMap[cmdId] ?? "";
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
