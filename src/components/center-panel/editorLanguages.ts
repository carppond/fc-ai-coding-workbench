import type { Extension } from "@codemirror/state";

/**
 * 根据文件扩展名动态加载语言支持
 */
export async function getLanguageExtension(filePath: string): Promise<Extension | null> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    // JavaScript / TypeScript
    case "js":
    case "jsx":
    case "mjs":
    case "cjs": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: ext.includes("x") });
    }
    case "ts":
    case "tsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: ext === "tsx", typescript: true });
    }

    // Rust
    case "rs": {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    }

    // Python
    case "py":
    case "pyw": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }

    // CSS / SCSS / LESS
    case "css": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }
    case "scss":
    case "sass": {
      const { sass } = await import("@codemirror/lang-sass");
      return sass({ indented: ext === "sass" });
    }
    case "less": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }

    // HTML
    case "html":
    case "htm":
    case "svg": {
      const { html } = await import("@codemirror/lang-html");
      return html();
    }

    // JSON
    case "json":
    case "jsonc": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }

    // Markdown
    case "md":
    case "mdx": {
      const { markdown } = await import("@codemirror/lang-markdown");
      return markdown();
    }

    // XML / Plist / Storyboard / XIB
    case "xml":
    case "plist":
    case "storyboard":
    case "xib":
    case "entitlements":
    case "xcsettings": {
      const { xml } = await import("@codemirror/lang-xml");
      return xml();
    }

    // YAML
    case "yaml":
    case "yml": {
      const { yaml } = await import("@codemirror/lang-yaml");
      return yaml();
    }

    // C / C++ / Objective-C / Swift（Swift 用 C++ 近似高亮）
    case "c":
    case "h": {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx": {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "m":
    case "mm": {
      // Objective-C / Objective-C++，用 C++ 解析器近似高亮
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "swift": {
      // Swift 暂无官方 CodeMirror 包，用 C++ 近似
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }

    // Java / Kotlin
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      return java();
    }
    case "kt":
    case "kts": {
      // Kotlin 用 Java 近似
      const { java } = await import("@codemirror/lang-java");
      return java();
    }

    // Go
    case "go": {
      const { go } = await import("@codemirror/lang-go");
      return go();
    }

    // SQL
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    }

    // PHP
    case "php": {
      const { php } = await import("@codemirror/lang-php");
      return php();
    }

    // Shell
    case "sh":
    case "bash":
    case "zsh":
    case "fish": {
      // Shell 暂无官方包，不加载语言扩展
      return null;
    }

    // TOML
    case "toml": {
      // TOML 暂无官方包，不加载语言扩展
      return null;
    }

    default:
      return null;
  }
}
