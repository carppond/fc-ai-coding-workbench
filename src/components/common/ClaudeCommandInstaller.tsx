import { useState, useEffect, useRef, useCallback } from "react";
import { Wand2, Check, X, Download, Trash2, HelpCircle } from "lucide-react";
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

如果提示词已包含足够信息，**直接跳到下一步**，不要多余提问。

## 第 1.5 步：复述确认

用 2-3 句话复述你对用户需求的理解（用你自己的话，不是复读原文）。让用户确认方向是否正确。
- 如果用户确认，继续优化。
- 如果用户纠正，基于纠正后的理解重新优化。

## 第 2 步：盲点检测

基于任务类型，检查用户是否遗漏了关键决策点：
- 如果涉及用户输入：是否考虑了校验和安全？
- 如果涉及数据处理：是否明确了数据量级和异常处理？
- 如果涉及 API：是否考虑了认证、限流、错误重试？
- 如果涉及前端：是否考虑了加载状态和边界情况？
- 如果涉及数据库：是否考虑了索引、事务、并发？

**只提示用户确实遗漏的点，不要列出已经覆盖的。** 如果没有明显遗漏，跳过此步。

## 第 3 步：优化

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

## 第 4 步：输出

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

## 第 5 步：确认

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

// frida-hook.md 文件内容
const FRIDA_HOOK_CONTENT = `---
description: 生成或更新 Frida Hook 脚本（iOS/Android 逆向）
argument-hint: [目标描述或已有脚本路径]
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

生成或更新 Frida Hook 脚本。

## 输入

目标：$ARGUMENTS

## 判断模式

- 如果目标描述中包含已有脚本文件名或路径 → **更新模式**，跳到步骤 3
- 否则 → **新建模式**，从步骤 1 开始

## 步骤 1：侦察阶段（新建模式）

先分析再动手，回答以下问题：

1. 目标 app 是否有反 Frida 保护（Bangcle、Arxan、dylib 注入检测）？如果有，立即建议二进制 patch 方案，不要继续尝试 Frida
2. hook 目标是 ObjC 方法、C 函数还是二进制偏移？
3. 目标函数是否是小 stub（<0x20 字节）？如果是，改用 NativeFunction 直接调用或二进制偏移 hook
4. 是否存在重入风险（hook 内部调用可能再次触发同一 hook）？
5. 如果有 IDA MCP 可用，通过 IDA MCP 工具获取目标函数的反编译代码、调用关系和参数类型

将分析结果列出，等用户确认后再生成代码。

## 步骤 2：IDA 辅助分析（可选）

如果 IDA MCP 可用：
- 用 \`decompile\` 获取目标函数伪代码
- 用 \`xrefs_to\` 查看谁调用了目标函数
- 用 \`callees\` 查看目标函数调用了哪些子函数
- 用 \`func_profile\` 获取函数大小和基本块信息
- 根据以上信息确定最佳 hook 点和参数解析方式

如果 IDA MCP 不可用，跳过此步骤，基于用户提供的信息生成脚本。

## 步骤 3：生成/更新脚本

### 新建模式
生成完整脚本。

### 更新模式
先读取已有脚本，理解现有结构，仅修改必要部分，保留原有 hook 和注释。

### 代码规范（两种模式都必须遵守）

- \`"use strict"\` 开头
- 所有 hook 使用 safeAttach 包装（try-catch onEnter/onLeave，防止 JS 异常杀死进程）：
\`\`\`javascript
function safeAttach(target, callbacks) {
    try {
        Interceptor.attach(target, {
            onEnter: function(args) {
                try { callbacks.onEnter?.call(this, args); }
                catch(e) { console.log("[!] onEnter error: " + e); }
            },
            onLeave: function(retval) {
                try { callbacks.onLeave?.call(this, retval); }
                catch(e) { console.log("[!] onLeave error: " + e); }
            }
        });
    } catch(e) {
        console.log("[!] Failed to attach: " + target + " - " + e);
    }
}
\`\`\`
- NativeCallback 和 ObjC.Block 引用推入模块级数组防 GC 回收：\`const _prevent_gc = [];\`
- **禁止** 使用 \`ApiResolver("objc").enumerateMatches\` 通配符枚举（900k+ 函数会耗尽内存）
- 用 \`ObjC.classes["ClassName"]\` 直接查找类
- 彩色 console.log 输出（区分不同 hook 组），使用 ANSI 颜色：
  - \\x1b[36m 青色：信息
  - \\x1b[33m 黄色：警告
  - \\x1b[32m 绿色：成功
  - \\x1b[31m 红色：错误
- 如需等待模块加载，用 \`setTimeout(main, 500)\` 延迟入口
- SharedModules 中 <0x20 字节的 stub 函数不要用 Interceptor.attach（trampoline 会覆盖相邻代码）
- 有重入风险的 hook 加入递归守卫（如 threadLocal 标志）
- 默认使用 spawn 模式

## 步骤 4：输出

### 脚本代码
\`\`\`javascript
（完整的 Frida hook 脚本）
\`\`\`

### 运行命令
\`\`\`bash
# spawn 模式（推荐）
frida -U -f <bundleId> -l <script>.js

# 或 attach 模式（app 已运行）
frida -U <bundleId> -l <script>.js
\`\`\`

### 已知风险和备选方案
- （列出可能的问题：反调试检测、函数内联、多线程竞争等）
- （对应的备选方案或规避方法）

## 注意事项

- 如果用户只说了类名或方法名，先确认是 iOS (ObjC/Swift) 还是 Android (Java/Native)
- 优先生成最小可用脚本，用户确认后再扩展功能
- 更新模式下不要重写整个文件，只改必要部分
`;

// debug-ios.md 文件内容
const DEBUG_IOS_CONTENT = `---
description: 分析 iOS 崩溃日志和运行时错误，定位根因并提供修复方案
argument-hint: [崩溃日志/错误描述/文件路径]
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

分析 iOS 崩溃或运行时错误，定位根因并提供修复方案。

## 输入

问题描述：$ARGUMENTS

## 分析流程

### 第 1 步：信息收集

根据输入类型判断：

- **崩溃日志**（包含 Exception Type、Thread Backtrace）→ 解析崩溃地址、异常类型、调用栈
- **错误描述**（文字描述）→ 确认是编译错误、运行时崩溃还是逻辑 bug
- **文件路径** → 读取文件，结合用户描述分析

确认运行环境：
- 真机 / 模拟器
- iOS 版本
- 是否越狱
- 是否有 Frida / 其他注入工具

如果信息不足，向用户询问以上关键信息（最多问 2 个问题）。

### 第 2 步：高优先级检查

按以下顺序逐项排查（先查最常见的坑）：

| 序号 | 类型 | 典型表现 | 排查方法 |
|------|------|---------|---------|
| 1 | **nil 插入集合类** | NSInvalidArgumentException, "attempt to insert nil object" | 检查 NSDictionary/NSArray/NSSet 构造和赋值 |
| 2 | **主线程违规** | UI 不更新、随机崩溃、"Main Thread Checker" | 检查 dispatch_async(dispatch_get_main_queue()) 缺失 |
| 3 | **野指针/提前释放** | EXC_BAD_ACCESS, SIGBUS | 检查 delegate 是否用 weak、block 循环引用、dealloc 后回调 |
| 4 | **后台任务超时** | 0xbad22222, 0x8badf00d (watchdog) | 检查 beginBackgroundTask/endBackgroundTask 配对、音频会话配置 |
| 5 | **类型不匹配** | unrecognized selector sent to instance | 检查 ObjC runtime 消息发送目标类型 |
| 6 | **内存问题** | Jetsam (OOM)、malloc 错误 | 检查大图片加载、缓存未清理、循环引用导致的内存泄漏 |
| 7 | **多线程竞争** | 偶发崩溃、数据不一致 | 检查共享数据是否有锁保护、Core Data 上下文线程安全 |

只列出与当前问题相关的检查项，不要列出所有项。

### 第 3 步：定位与修复

读取相关源代码文件，然后：

**崩溃定位：**
\`\`\`
文件：xxx.m / xxx.swift
行号：第 N 行
崩溃原因：（一句话解释为什么崩溃）
\`\`\`

**问题代码：**
\`\`\`objc
// 标注问题所在
(有问题的代码片段)
\`\`\`

**修复方案：**
\`\`\`objc
// 修复后的代码
(修复后的代码片段)
\`\`\`

**修复说明：**（为什么这样改能解决问题——2-3 句话）

如果有多个可能原因，按可能性从高到低排序，每个原因都给出对应的修复方案。

### 第 4 步：防御性建议

修复后，检查同文件/同模块中是否有**相同模式**的潜在问题：
- 列出发现的潜在风险（附带文件名和行号）
- **不自动修改**，只提示用户注意

如果没有发现同类问题，跳过此步骤。

## 输出规范

- 用中文输出
- 代码片段保持原始语言（ObjC / Swift）
- 如果崩溃日志中包含符号化信息，优先用符号名定位；如果只有地址，提示用户用 atos 或 dSYM 符号化
- 不要猜测——如果信息不够定位，明确说"需要更多信息"并指出需要什么
`;

// deploy-check.md 文件内容
const DEPLOY_CHECK_CONTENT = `---
description: 部署前检查（nginx/SSL/端口/防火墙/脚本/iOS OTA）
argument-hint: [检查目标描述]
allowed-tools: Read, Grep, Glob, Bash(*)
---

对部署配置进行全面检查，发现问题并给出修复方案。

## 输入

目标：$ARGUMENTS

## 检查流程

### 第 1 步：环境信息收集

先确认以下约束。如果用户未提供，**主动询问**（最多问 3 个关键问题，不要一次全问）：

- 目标服务器 IP / 域名
- 哪些端口已被占用（特别是 80/443）
- 是否有已运行的 nginx / caddy / apache
- SSL 证书来源（Let's Encrypt / 自签 / 已有证书）
- 是否需要支持 iOS OTA 安装（itms-services plist）

如果用户描述中已包含这些信息，直接进入检查。

### 第 2 步：逐项检查

按顺序执行以下检查项（跳过与当前场景无关的项）：

#### 1. 端口冲突
- 检查配置中的端口是否与已有服务冲突
- **绝不假设 80/443 可用**
- 如有冲突，给出替代端口建议和对应的配置修改

#### 2. nginx 配置语法
- 检查 server_name、proxy_pass、SSL 路径是否正确
- 检查 upstream 配置、超时设置、缓冲区大小
- 运行 \`nginx -t\` 验证语法（如果可以访问服务器）
- 检查是否缺少必要的 header（X-Real-IP, X-Forwarded-For 等）

#### 3. SSL 证书
- 证书文件路径是否存在
- 证书是否过期（\`openssl x509 -enddate -noout -in cert.pem\`）
- 文件权限是否正确（私钥 600，证书 644）
- 证书链是否完整（中间证书是否包含）

#### 4. 防火墙规则
- 配置的端口是否在防火墙中放行
- 检查 ufw / firewalld / iptables 规则
- 云服务商安全组是否放行（提醒用户检查）

#### 5. deploy.sh 脚本审查
- 硬编码路径（应使用变量）
- 未展开的变量（如 \`$UNDEFINED_VAR\` 会变成空字符串）
- 缺失的依赖（命令是否存在）
- 未处理的错误（关键命令缺少 \`set -e\` 或错误检查）
- 权限问题（脚本是否有执行权限，是否需要 sudo）

#### 6. iOS OTA 兼容性（如需要）
- plist 中的 URL 是否使用 HTTPS（iOS 强制要求）
- bundle-identifier 是否正确
- IPA 文件的 MIME 类型是否在 nginx 中配置（\`application/octet-stream\`）
- manifest.plist 的 Content-Type 是否为 \`text/xml\`
- 安装链接格式：\`itms-services://?action=download-manifest&url=https://...\`

### 第 3 步：输出报告

用表格汇总所有检查结果：

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 端口冲突 | ✅ / ❌ | （具体说明） |
| nginx 配置 | ✅ / ❌ | （具体说明） |
| SSL 证书 | ✅ / ❌ | （具体说明） |
| 防火墙 | ✅ / ❌ | （具体说明） |
| 部署脚本 | ✅ / ❌ | （具体说明） |
| iOS OTA | ✅ / ❌ / ⏭️ | （具体说明，⏭️ = 不涉及） |

### 第 4 步：修复方案

对每个 ❌ 项，给出：
- 问题原因（一句话）
- 修复命令或代码（可直接复制执行）
- 修复后的验证方法

## 使用示例

\`\`\`
/project:deploy-check 检查 deploy.sh 能否正常部署到 VPS

/project:deploy-check nginx 配置是否有问题，端口用的 8080，已有服务占了 443

/project:deploy-check IPA 托管平台部署，需要支持 iOS OTA 安装

/project:deploy-check 新增了 SSL 证书，检查 nginx 和防火墙配置
\`\`\`

## 注意事项

- 用中文输出
- 所有修复命令必须可直接复制执行
- 如果无法访问服务器，给出本地可执行的检查命令 + 远程需要用户手动执行的命令
- 不要假设任何端口可用，不要假设任何服务未运行
`;

// ida-analyze.md 文件内容
const IDA_ANALYZE_CONTENT = `---
description: IDA 逆向分析辅助（反编译、调用链、数据流、反调试检测）
argument-hint: [函数地址/函数名/功能描述]
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

使用 IDA MCP 工具对目标进行深入逆向分析。

## 输入

分析目标：$ARGUMENTS

## 分析流程

### 第 1 步：确认分析范围

先明确以下信息（如果用户未提供则询问）：

- 目标是**函数地址**、**函数名**还是**功能描述**（如"登录加密流程"）？
- 涉及哪些二进制 / IDA 实例？列出所有需要用到的实例名称
- 如果涉及多个二进制（主程序 + 动态库等），明确各自的角色

### 第 2 步：定位目标函数

根据输入类型选择策略：

| 输入类型 | 定位方法 |
|---------|---------|
| 函数地址（如 0x100012AB4） | 直接 \`decompile\` 获取伪代码 |
| 函数名（如 \`-[LoginManager encryptPassword:]\`） | 直接 \`decompile\` 或 \`find\` 搜索 |
| 功能描述（如"登录加密"） | 用 \`find\` / \`find_regex\` 搜索相关字符串或符号，定位入口函数 |
| 跨二进制 | 在各 IDA 实例中分别搜索，追踪跨二进制调用关系 |

定位后用 \`func_profile\` 获取函数大小、基本块数量，判断复杂度。

### 第 3 步：深入分析

按需执行以下分析（不是每个都必须做，根据目标选择）：

**反编译**
- \`decompile\` 获取伪代码，分析参数含义和返回值

**调用关系**
- \`xrefs_to\` — 谁调用了目标函数（向上追溯）
- \`callees\` — 目标函数调用了谁（向下展开）
- 跨二进制：如果调用链跨越多个二进制，在对应 IDA 实例中继续跟踪，拼接完整调用链

**数据流**
- \`trace_data_flow\` — 追踪关键参数的来源和去向（加密 key 从哪来、返回值传到哪去）

**字符串与常量**
- \`get_string\` / \`get_bytes\` — 提取硬编码的密钥、URL、配置
- 关注 base64 编码的字符串、十六进制常量

**结构体**
- \`search_structs\` / \`read_struct\` — 分析相关数据结构定义

### 第 4 步：专项分析（按需执行）

#### 版本对比
如果用户提供了新旧两个版本：
- 用 \`diff_before_after\` 对比同一函数的变化
- 总结改动点：协议变更、新增校验、反作弊更新等
- 标注新增/删除/修改的代码块

#### 反调试/反篡改检测
搜索常见保护手段：

| 保护类型 | 搜索特征 |
|---------|---------|
| 反调试 | \`ptrace(PT_DENY_ATTACH)\`、\`sysctl\` 进程检测 |
| 注入检测 | \`_dyld_image_count\`、\`dladdr\`、异常 dylib 名称 |
| Frida 检测 | \`frida-agent\` 字符串、27042 端口、\`/usr/lib/frida\` |
| 完整性校验 | 代码段 hash、签名验证、__TEXT 段校验 |
| 环境检测 | 越狱检测（\`/Applications/Cydia.app\`、\`/bin/bash\`） |

#### 字符串解密/去混淆
- 定位加密字符串的解密函数
- 分析解密逻辑（XOR、AES、自定义算法）
- 尝试提取明文
- 如果是批量加密字符串，分析解密函数的调用模式

### 第 5 步：输出

#### 1. 函数功能总结
用中文描述这个函数做了什么（2-3 句话概括核心逻辑）。

#### 2. 关键发现
- 加密算法和密钥来源
- 通信协议格式
- 保护机制
- 其他有价值的发现

#### 3. 调用链图
简化的调用关系，跨二进制的标注来源：

\`\`\`
[主程序] -[LoginVC loginTapped:]
  → -[LoginManager encryptPassword:]
    → -[CryptoUtil aesEncrypt:withKey:]
      → [libcommonCrypto.dylib] CCCrypt
  → -[NetworkManager sendRequest:]
    → [AFNetworking] -[AFHTTPSessionManager POST:...]
\`\`\`

#### 4. Frida Hook 骨架
基于分析出的函数地址、参数类型和语义，生成可直接使用的 hook 代码片段：

\`\`\`javascript
// 基于分析结果生成的 hook（包含参数解析和返回值读取）
\`\`\`

#### 5. 关键偏移量

| 地址 | 函数名 | 用途 | 所属二进制 |
|------|--------|------|-----------|
| 0x... | ... | ... | ... |

### 第 6 步：更新 CLAUDE.md

将本次分析发现的关键偏移量、函数用途、数据结构追加到项目 CLAUDE.md 的对应章节中（如 Key Binary Offsets、Key Classes 等）。
- 避免重复条目
- 如果 CLAUDE.md 不存在或没有相关章节，创建对应章节

## 注意事项

- 用中文输出分析结果
- 代码和伪代码保持原始形式
- 如果 IDA MCP 不可用，明确告知用户需要配置 IDA MCP 才能使用此命令
- 对于大函数（>100 基本块），先给出整体结构概述，再逐段分析
- 不要一次性分析太多函数——聚焦用户关心的目标，按需展开
`;

interface CommandInfo {
  id: string;
  filename: string;
  installed: boolean;
}

// 每个命令的使用示例
const COMMAND_USAGE: Record<string, string[]> = {
  "optimize-prompt": [
    "/optimize-prompt 写一个爬虫抓取商品价格",
    "/optimize-prompt 帮我优化这段 SQL 查询",
    "/optimize-prompt 用 React 写一个 Todo 应用",
  ],
  "code-review": [
    "/code-review src/api/auth.ts",
    "/code-review src/components/",
    "/code-review 检查登录模块的安全问题",
  ],
  "debug": [
    "/debug TypeError: Cannot read property 'map' of undefined",
    "/debug src/utils/parser.ts 第 42 行报错",
    "/debug 页面加载后白屏",
  ],
  "gen-tests": [
    "/gen-tests src/utils/crypto.ts",
    "/gen-tests src/api/userService.ts",
  ],
  "gen-docs": [
    "/gen-docs src/api/",
    "/gen-docs src/components/DataTable.tsx",
    "/gen-docs .  (整个项目)",
  ],
  "frida-hook": [
    "/project:frida-hook WhatsApp 的 AES-GCM 加密函数",
    "/project:frida-hook hook 某 app 的登录请求，抓取 token",
    "/project:frida-hook 修复 wa_reg_crypto_monitor.js 重入崩溃",
    "/project:frida-hook 给 wa_ssl_bypass_v3.js 加上 SecTrust 的 hook",
  ],
  "debug-ios": [
    "/project:debug-ios app 启动后 3 秒崩溃，日志显示 NSInvalidArgumentException",
    "/project:debug-ios NSDictionary 插入 nil 崩溃，堆栈在 UserManager.m 第 45 行",
    "/project:debug-ios 后台播放音频 3 分钟后被系统杀死",
    "/project:debug-ios Frida 注入后 WhatsApp 闪退，无崩溃日志",
  ],
  "deploy-check": [
    "/project:deploy-check 检查 deploy.sh 能否正常部署到 VPS",
    "/project:deploy-check nginx 配置是否有问题，端口用的 8080，已有服务占了 443",
    "/project:deploy-check IPA 托管平台部署，需要支持 iOS OTA 安装",
    "/project:deploy-check 新增了 SSL 证书，检查 nginx 和防火墙配置",
  ],
  "ida-analyze": [
    "/project:re-analyze 0x103B96F54 这个函数的加密逻辑，用 ida-mcp 和 ida_share_module",
    "/project:re-analyze 定位 WhatsApp 的注册短信验证流程入口",
    "/project:re-analyze 对比新旧版本 sub_103396FF4 的变化",
    "/project:re-analyze 分析这个 app 的反调试保护，查 ptrace 和 Frida 检测",
    "/project:re-analyze SharedModules 里的 mbedtls_ssl_handshake 调用链，用 ida_share_module",
    "/project:re-analyze 定位加密字符串的解密函数，提取明文",
  ],
};

export function ClaudeCommandInstaller() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [commands, setCommands] = useState<CommandInfo[]>([
    { id: "optimize-prompt", filename: "optimize-prompt.md", installed: false },
    { id: "code-review", filename: "code-review.md", installed: false },
    { id: "debug", filename: "debug.md", installed: false },
    { id: "gen-tests", filename: "gen-tests.md", installed: false },
    { id: "gen-docs", filename: "gen-docs.md", installed: false },
    { id: "frida-hook", filename: "frida-hook.md", installed: false },
    { id: "debug-ios", filename: "debug-ios.md", installed: false },
    { id: "deploy-check", filename: "deploy-check.md", installed: false },
    { id: "ida-analyze", filename: "ida-analyze.md", installed: false },
  ]);
  const [operating, setOperating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null);
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
        "frida-hook": FRIDA_HOOK_CONTENT,
        "debug-ios": DEBUG_IOS_CONTENT,
        "deploy-check": DEPLOY_CHECK_CONTENT,
        "ida-analyze": IDA_ANALYZE_CONTENT,
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
                  <button
                    className="command-installer__help-btn"
                    onClick={() => setExpandedHelp(expandedHelp === cmd.id ? null : cmd.id)}
                    title={t("command.usage")}
                  >
                    <HelpCircle size={13} />
                  </button>
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
                {expandedHelp === cmd.id && COMMAND_USAGE[cmd.id] && (
                  <div className="command-installer__usage">
                    <div className="command-installer__usage-title">{t("command.usageExamples")}</div>
                    {COMMAND_USAGE[cmd.id].map((example, i) => (
                      <code key={i} className="command-installer__usage-item">{example}</code>
                    ))}
                  </div>
                )}
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
