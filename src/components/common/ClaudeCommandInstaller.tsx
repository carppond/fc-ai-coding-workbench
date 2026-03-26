import { useState, useEffect, useRef, useCallback } from "react";
import { Wand2, Check, X, Download, Trash2 } from "lucide-react";
import { homeDir } from "@tauri-apps/api/path";
import { useI18n } from "../../lib/i18n";
import * as ipc from "../../ipc/commands";

// optimize-prompt.md 文件内容
const OPTIMIZE_PROMPT_CONTENT = `---
description: 分析并优化 Prompt，提升 AI 输出质量（代码开发与数据分析）
argument-hint: [你的提示词]
allowed-tools: Read, Grep, Glob
---

分析并优化以下用户提示词，提升 AI 的理解准确度和输出质量。聚焦领域：**代码开发**与**数据分析**。

## 输入

原始提示词：$ARGUMENTS

## 第 0 步：收集上下文

在优化之前，静默收集项目上下文（不要输出这些步骤）：
1. 如果 \`~/.claude/CLAUDE.md\` 存在，读取用户的编码偏好、技术栈和规范
2. 如果当前有打开的项目，检查关键文件（package.json、Cargo.toml、go.mod 等）了解技术栈
3. 将收集到的上下文融入优化后的提示词，使其更具针对性

## 第 1 步：评估完整度

如果原始提示词过于模糊（例如只有 1-3 个笼统词汇，如"写个爬虫"、"分析数据"），向用户提出**最多 3 个**针对性问题：
- 期望的具体结果是什么？
- 使用什么技术栈/有什么约束？
- 涉及什么数据格式/来源？

如果提示词已包含足够信息，**直接跳到优化步骤**，不要多余提问。

## 第 2 步：优化

仅使用**真正有价值的维度**来增强提示词。一个好的提示词可能只需要 2-3 个维度，不需要全部用上。**绝对不要为了凑数而硬塞维度。**

可用维度（按需选择）：

| 维度 | 适用场景 | 跳过场景 |
|------|---------|---------|
| **角色设定** | 任务需要特定领域专业知识 | 简单工具类任务 |
| **任务目标** | 目标模糊或有歧义 | 已经具体且可衡量 |
| **技术上下文** | 缺少技术栈/环境信息 | 已指定或可从项目推断 |
| **约束条件** | 质量要求重要（性能、安全、风格） | 快速原型或探索性任务 |
| **输出格式** | 期望交付物不明确 | 显而易见（如"修复这个 bug"） |
| **示例** | 期望行为需要澄清 | 逻辑简单直白 |

## 第 3 步：输出

使用中文输出全部内容。

### 原始 Prompt
> （原样展示用户的输入）

### 问题诊断
- （列出 2-4 个具体问题：哪里模糊、缺少什么信息、可能被误解的地方）

### 优化后 Prompt

\`\`\`
（完整的、可直接使用的优化后提示词。应当自包含——可以直接发送给任何 AI 模型，无需额外上下文。）
\`\`\`

### 改动摘要

| 改动内容 | 理由 |
|---------|------|
| （具体改了什么） | （为什么这样改——一句话） |

（只列出实际改动。如果原始提示词已经很好，直接说明并建议微调即可。）

## 最后一步

询问：**"是否直接按优化后的 Prompt 执行？或者需要调整某些部分？"**

如果用户确认，立即在当前对话中执行优化后的提示词。
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

// gen-docs.md 文件内容
const GEN_DOCS_CONTENT = `---
description: Generate user-oriented documentation for files, modules or projects
argument-hint: [file-path or directory-path]
allowed-tools: Read, Grep, Glob
---

Generate user-oriented documentation for the specified target.

## Input

Documentation target: $ARGUMENTS

## Step 1: Language Selection

Ask the user:

"请选择文档语言 / Select document language:
1. 中文（默认）
2. English"

If the user does not respond or says "1" or "中文", use Chinese with English technical terms retained.
If the user says "2" or "English", use English.

## Step 2: Read and Analyze

1. If the input is a file path, read the file to understand all exports, functions, classes, and usage patterns
2. If the input is a directory path, use Glob to find source files, then read key files to understand the module structure
3. If no input provided, read the project root to understand the overall architecture (package.json, main entry, directory structure)

Focus on understanding:
- What does this code DO (from a user's perspective)?
- What are the main commands/functions/APIs a user would interact with?
- How do different parts connect to each other (data flow)?
- What are the typical use cases?

## Step 3: Generate Outline

Present a documentation outline for user approval before writing the full content.

Format:
### 文档大纲 / Document Outline

1. **概述** — One sentence: what this is and who it's for
2. **快速开始** — Minimal steps to get running
3. **核心功能** — List each command/function/API with:
   - section name
   - one-line description
4. **工作流** — List planned workflow sections
5. **附录** — FAQ, glossary, etc. (if needed)

Then ask: "大纲是否需要调整？确认后开始生成完整文档。"

## Step 4: Generate Full Documentation

After user confirms the outline, generate the complete documentation following these principles:

### Principle 1: User Mental Model

For each command/function/API, answer these 5 questions in order:

| Question | What it solves |
|----------|---------------|
| **When to use** (什么时候用) | "Should I use this?" — describe the user's goal, not the feature |
| **How to use** (怎么用) | Parameters, flags, syntax |
| **Where input comes from** (输入从哪来) | How to obtain the parameter values |
| **How to read output** (怎么看输出) | What each part of the output means |
| **What's next** (下一步) | What to do after seeing the result |

### Principle 2: Scenario-Driven Index

Add a "Typical Scenario" column to the command/API index table:

| Command/API | Description | Typical Scenario |
|-------------|-------------|------------------|
| name | what it does | when a user would reach for it |

### Principle 3: Data Flow Between Commands

Show how commands/functions connect. Use arrow notation:

\`commandA output → commandB input → commandC input\`

In each command section, add "Where does the input come from?" listing concrete sources.

### Principle 4: Annotated Examples

For every example, add inline annotations on key lines:

\`\`\`
output line 1              ← what this means
output line 2              ← why this matters
\`\`\`

### Principle 5: Task-Oriented Workflows

At the end, organize commands into workflows by user goal:

### Workflow: [User Goal]
1. step one → what to look at
2. step two → what to do with the result
3. step three → conclusion

### Principle 6: Compare Similar Features

If multiple commands/functions do similar things, add a comparison:

| Feature | A | B | C |
|---------|---|---|---|
| Use when | ... | ... | ... |
| Output | ... | ... | ... |
| Best for | ... | ... | ... |

## Output Format

Output the complete documentation in Markdown format, ready to save as a .md file.

## Guidelines

- Write for the USER, not the developer — assume the reader wants to USE the tool, not modify it
- Lead with "when to use" not "what it does" — users come with goals, not feature names
- Every example must be runnable or copy-pastable
- Do not document internal implementation details unless they affect usage
- If a function is simple and self-explanatory, keep its docs short — do not pad
- Use consistent terminology throughout the document
- If the codebase has existing docs, respect their style and fill gaps rather than rewrite
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
    { id: "gen-docs", filename: "gen-docs.md", installed: false },
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
        "gen-docs": GEN_DOCS_CONTENT,
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
