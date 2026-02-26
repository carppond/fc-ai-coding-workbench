import { X } from "lucide-react";
import { useI18n } from "../../lib/i18n";

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  const { t, locale } = useI18n();

  if (!open) return null;

  const zh = locale === "zh";

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="guide-dialog__header">
          <span className="guide-dialog__title">{t("guide.title")}</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="guide-dialog__body">

          {/* 一、项目初始化 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "一、项目初始化（新项目第一件事）" : "1. Project Initialization"}
            </h2>

            <h3 className="guide-section__subtitle">
              {zh ? "1. 创建 CLAUDE.md" : "1. Create CLAUDE.md"}
            </h3>
            <p>{zh ? "直接对我说：" : "Just say:"}</p>
            <pre className="guide-pre">
              {zh
                ? "帮我分析当前项目结构，生成一个 CLAUDE.md"
                : "Analyze the current project structure and generate a CLAUDE.md"}
            </pre>
            <p>{zh ? "我会自动扫描项目，生成类似这样的文件：" : "I'll automatically scan the project and generate a file like:"}</p>
            <pre className="guide-pre">{`# 项目名称

## 技术栈
- Objective-C, MRC 手动内存管理

## 项目结构
- /Controllers — 页面控制器
- /Helpers — 工具类
- /Models — 数据模型

## 核心模块
- TextRegionGroupHelper — 文本区域分组核心逻辑

## 构建命令
- xcodebuild -scheme MyApp

## 编码规范
- 缩进：4空格
- 命名：驼峰`}</pre>

            <h3 className="guide-section__subtitle">
              {zh ? "2. 告诉我项目规则" : "2. Tell Me Project Rules"}
            </h3>
            <pre className="guide-pre">{zh
              ? `记住：这个项目用 MRC，不要用 ARC
记住：所有 Helper 类都是单例模式
记住：提交代码前要跑 xcodebuild test`
              : `Remember: this project uses MRC, not ARC
Remember: all Helper classes are singletons
Remember: run xcodebuild test before committing`}</pre>
          </section>

          {/* 二、日常开发中的指令 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "二、日常开发中的指令" : "2. Daily Development Commands"}
            </h2>

            <h3 className="guide-section__subtitle">
              {zh ? "让我记住东西" : "Ask Me to Remember"}
            </h3>
            <pre className="guide-pre">{zh
              ? `记住这个：xxx
以后都这样做：xxx
记住这个项目的规则：xxx`
              : `Remember this: xxx
Always do it this way: xxx
Remember this project rule: xxx`}</pre>

            <h3 className="guide-section__subtitle">
              {zh ? "让我忘掉东西" : "Ask Me to Forget"}
            </h3>
            <pre className="guide-pre">{zh
              ? `忘掉之前关于 xxx 的记忆
不要再 xxx 了`
              : `Forget the memory about xxx
Stop doing xxx`}</pre>

            <h3 className="guide-section__subtitle">
              {zh ? "查看当前记忆" : "View Current Memories"}
            </h3>
            <pre className="guide-pre">{zh
              ? "看看你现在记住了哪些关于这个项目的内容"
              : "What do you remember about this project?"}</pre>

            <h3 className="guide-section__subtitle">
              {zh ? "更新 CLAUDE.md" : "Update CLAUDE.md"}
            </h3>
            <pre className="guide-pre">{zh
              ? `更新 CLAUDE.md，加上 xxx
把 CLAUDE.md 里的 xxx 改成 yyy`
              : `Update CLAUDE.md, add xxx
Change xxx to yyy in CLAUDE.md`}</pre>
          </section>

          {/* 三、对话管理 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "三、对话管理" : "3. Conversation Management"}
            </h2>

            <h3 className="guide-section__subtitle">
              {zh ? "场景 1：继续昨天的工作" : "Scenario 1: Continue Yesterday's Work"}
            </h3>
            <pre className="guide-pre">claude --resume</pre>
            <p>{zh ? "上下文完整恢复，直接继续。" : "Full context restored, continue where you left off."}</p>

            <h3 className="guide-section__subtitle">
              {zh ? "场景 2：对话太长变慢了" : "Scenario 2: Conversation Too Long"}
            </h3>
            <pre className="guide-pre">/compact</pre>
            <p>{zh ? "压缩早期内容，保留关键信息。" : "Compresses earlier content, keeping key information."}</p>

            <h3 className="guide-section__subtitle">
              {zh ? "场景 3：开全新对话但想保留知识" : "Scenario 3: New Conversation, Keep Knowledge"}
            </h3>
            <p>{zh
              ? "不用做任何事，CLAUDE.md 和 memory 文件自动加载。"
              : "No action needed — CLAUDE.md and memory files load automatically."}</p>
          </section>

          {/* 四、全局 vs 项目级记忆 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "四、全局 vs 项目级记忆" : "4. Global vs Project-Level Memory"}
            </h2>

            <h3 className="guide-section__subtitle">
              {zh ? "所有项目通用的偏好" : "Preferences Across All Projects"}
            </h3>
            <pre className="guide-pre">{zh
              ? `记住，这是我的全局偏好：我喜欢用中文注释
全局记住：代码缩进用 4 空格`
              : `Remember, this is my global preference: use Chinese comments
Global: use 4 spaces for indentation`}</pre>
            <p>→ {zh ? "写入" : "Saved to"} <code className="guide-code">~/.claude/CLAUDE.md</code></p>

            <h3 className="guide-section__subtitle">
              {zh ? "仅当前项目" : "Current Project Only"}
            </h3>
            <pre className="guide-pre">{zh
              ? `记住：这个项目用 Swift 5.9
记住：API base URL 是 xxx`
              : `Remember: this project uses Swift 5.9
Remember: API base URL is xxx`}</pre>
            <p>→ {zh ? "写入项目级 memory" : "Saved to project-level memory"}</p>
          </section>

          {/* 五、实际工作流示例 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "五、实际工作流示例" : "5. Workflow Example"}
            </h2>

            <h3 className="guide-section__subtitle">Day 1 — {zh ? "新项目" : "New Project"}</h3>
            <pre className="guide-pre">{zh
              ? `你：打开项目
你：帮我分析项目结构，生成 CLAUDE.md
你：记住：这个项目不要用第三方库
你：记住：网络层在 NetworkManager 里
你：开始帮我写 xxx 功能`
              : `You: Open project
You: Analyze project, generate CLAUDE.md
You: Remember: no third-party libraries
You: Remember: networking is in NetworkManager
You: Start building xxx feature`}</pre>

            <h3 className="guide-section__subtitle">Day 2 — {zh ? "继续开发" : "Continue"}</h3>
            <pre className="guide-pre">{`claude --resume
${zh ? "你：继续昨天的 xxx 功能" : "You: Continue yesterday's xxx feature"}`}</pre>

            <h3 className="guide-section__subtitle">Day 3 — {zh ? "新对话，记忆都在" : "New Session, Memory Intact"}</h3>
            <pre className="guide-pre">{`claude
${zh ? "你：帮我修一下 NetworkManager 的 bug" : "You: Fix the NetworkManager bug"}
${zh ? "我：（自动读了 CLAUDE.md，知道项目结构，直接定位文件）" : "Me: (Auto-read CLAUDE.md, located file instantly)"}`}</pre>
          </section>

          {/* 六、速查表 */}
          <section className="guide-section">
            <h2 className="guide-section__title">
              {zh ? "六、速查表" : "6. Quick Reference"}
            </h2>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>{zh ? "你想做什么" : "What You Want"}</th>
                  <th>{zh ? "说什么 / 做什么" : "What to Say / Do"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{zh ? "初始化项目记忆" : "Init project memory"}</td>
                  <td><code className="guide-code">{zh ? "分析项目，生成 CLAUDE.md" : "Analyze project, generate CLAUDE.md"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "记住项目规则" : "Remember project rule"}</td>
                  <td><code className="guide-code">{zh ? "记住：xxx" : "Remember: xxx"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "记住全局偏好" : "Remember global pref"}</td>
                  <td><code className="guide-code">{zh ? "全局记住：xxx" : "Global: xxx"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "忘掉某个记忆" : "Forget a memory"}</td>
                  <td><code className="guide-code">{zh ? "忘掉关于 xxx 的记忆" : "Forget about xxx"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "查看所有记忆" : "View all memories"}</td>
                  <td><code className="guide-code">{zh ? "你记住了什么" : "What do you remember?"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "更新项目说明" : "Update project docs"}</td>
                  <td><code className="guide-code">{zh ? "更新 CLAUDE.md" : "Update CLAUDE.md"}</code></td>
                </tr>
                <tr>
                  <td>{zh ? "恢复上次对话" : "Resume last session"}</td>
                  <td><code className="guide-code">claude --resume</code></td>
                </tr>
                <tr>
                  <td>{zh ? "压缩长对话" : "Compact long chat"}</td>
                  <td><code className="guide-code">/compact</code></td>
                </tr>
                <tr>
                  <td>{zh ? "查看可恢复的对话" : "List resumable sessions"}</td>
                  <td><code className="guide-code">claude --resume-list</code></td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 核心原则 */}
          <section className="guide-section">
            <div className="guide-tip">
              <h3 className="guide-section__subtitle" style={{ marginTop: 0 }}>
                {zh ? "核心原则" : "Core Principles"}
              </h3>
              <p>
                {zh
                  ? "CLAUDE.md 记\"地图\"，memory 记\"规则\"，代码本身不用记"
                  : "CLAUDE.md = \"map\", memory = \"rules\", code doesn't need to be memorized"}
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
