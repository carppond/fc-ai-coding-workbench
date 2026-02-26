import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { listen } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as ipc from "../../ipc/commands";
import { useSettingsStore, type Theme } from "../../stores/settingsStore";

/** Replace glyphs that render poorly in xterm.js with visually equivalent alternatives. */
const GLYPH_REPLACEMENTS: [string, string][] = [
  ["\u23FA", "\u25CF"],  // ⏺ → ● (filled circle)
];
function fixGlyphs(text: string): string {
  let result = text;
  for (const [from, to] of GLYPH_REPLACEMENTS) {
    if (result.includes(from)) {
      result = result.replaceAll(from, to);
    }
  }
  return result;
}

const TERMINAL_THEMES: Record<Theme, ITheme> = {
  mocha: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#89b4fa",
    cursorAccent: "#1e1e2e",
    selectionBackground: "rgba(137, 180, 250, 0.3)",
    selectionForeground: "#cdd6f4",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f5a2b9",
    brightGreen: "#b8e9b4",
    brightYellow: "#fbebc3",
    brightBlue: "#a1c3fb",
    brightMagenta: "#d5b8f9",
    brightCyan: "#aae8dd",
    brightWhite: "#a6adc8",
  },
  macchiato: {
    background: "#24273a",
    foreground: "#cad3f5",
    cursor: "#8aadf4",
    cursorAccent: "#24273a",
    selectionBackground: "rgba(138, 173, 244, 0.3)",
    selectionForeground: "#cad3f5",
    black: "#494d64",
    red: "#ed8796",
    green: "#a6da95",
    yellow: "#eed49f",
    blue: "#8aadf4",
    magenta: "#c6a0f6",
    cyan: "#8bd5ca",
    white: "#b8c0e0",
    brightBlack: "#5b6078",
    brightRed: "#f1a0ab",
    brightGreen: "#b8e3ab",
    brightYellow: "#f2ddb5",
    brightBlue: "#a2bff7",
    brightMagenta: "#d2b3f8",
    brightCyan: "#a3ddd4",
    brightWhite: "#a5adcb",
  },
  frappe: {
    background: "#303446",
    foreground: "#c6d0f5",
    cursor: "#8caaee",
    cursorAccent: "#303446",
    selectionBackground: "rgba(140, 170, 238, 0.3)",
    selectionForeground: "#c6d0f5",
    black: "#51576d",
    red: "#e78284",
    green: "#a6d189",
    yellow: "#e5c890",
    blue: "#8caaee",
    magenta: "#ca9ee6",
    cyan: "#81c8be",
    white: "#b5bfe2",
    brightBlack: "#626880",
    brightRed: "#ec9c9e",
    brightGreen: "#b7dba1",
    brightYellow: "#ecd4a8",
    brightBlue: "#a4bcf2",
    brightMagenta: "#d5b3ec",
    brightCyan: "#9bd4cb",
    brightWhite: "#a5adce",
  },
  latte: {
    background: "#eff1f5",
    foreground: "#4c4f69",
    cursor: "#1e66f5",
    cursorAccent: "#eff1f5",
    selectionBackground: "rgba(30, 102, 245, 0.2)",
    selectionForeground: "#4c4f69",
    black: "#5c5f77",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#8839ef",
    cyan: "#179299",
    white: "#acb0be",
    brightBlack: "#6c6f85",
    brightRed: "#b5082e",
    brightGreen: "#2d9018",
    brightYellow: "#c97d0c",
    brightBlue: "#0b55d8",
    brightMagenta: "#7230d2",
    brightCyan: "#0c7d85",
    brightWhite: "#bcc0cc",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#bd93f9",
    cursorAccent: "#282a36",
    selectionBackground: "rgba(189, 147, 249, 0.3)",
    selectionForeground: "#f8f8f2",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#88c0d0",
    cursorAccent: "#2e3440",
    selectionBackground: "rgba(136, 192, 208, 0.3)",
    selectionForeground: "#d8dee9",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#d08770",
    brightGreen: "#b4cb9c",
    brightYellow: "#f0d6a3",
    brightBlue: "#9ab4cf",
    brightMagenta: "#c4a3bf",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  tokyoNight: {
    background: "#1a1b26",
    foreground: "#a9b1d6",
    cursor: "#7aa2f7",
    cursorAccent: "#1a1b26",
    selectionBackground: "rgba(122, 162, 247, 0.3)",
    selectionForeground: "#a9b1d6",
    black: "#32344a",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#787c99",
    brightBlack: "#444b6a",
    brightRed: "#ff7a93",
    brightGreen: "#b9f27c",
    brightYellow: "#ff9e64",
    brightBlue: "#7da6ff",
    brightMagenta: "#cda8f8",
    brightCyan: "#0db9d7",
    brightWhite: "#acb0d0",
  },
  oneDark: {
    background: "#282c34",
    foreground: "#abb2bf",
    cursor: "#61afef",
    cursorAccent: "#282c34",
    selectionBackground: "rgba(97, 175, 239, 0.3)",
    selectionForeground: "#abb2bf",
    black: "#3f4451",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#d7dae0",
    brightBlack: "#5c6370",
    brightRed: "#e8838a",
    brightGreen: "#a9d489",
    brightYellow: "#edcf98",
    brightBlue: "#79bdf2",
    brightMagenta: "#d48ee6",
    brightCyan: "#6fc5d0",
    brightWhite: "#eff0f1",
  },
  gruvboxDark: {
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#83a598",
    cursorAccent: "#282828",
    selectionBackground: "rgba(131, 165, 152, 0.3)",
    selectionForeground: "#ebdbb2",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    cursorAccent: "#272822",
    selectionBackground: "rgba(73, 72, 62, 0.5)",
    selectionForeground: "#f8f8f2",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#ff4d8a",
    brightGreen: "#baed52",
    brightYellow: "#f7cc92",
    brightBlue: "#80e2f5",
    brightMagenta: "#c09aff",
    brightCyan: "#b3f4ea",
    brightWhite: "#f9f8f5",
  },
  rosePine: {
    background: "#191724",
    foreground: "#e0def4",
    cursor: "#c4a7e7",
    cursorAccent: "#191724",
    selectionBackground: "rgba(196, 167, 231, 0.25)",
    selectionForeground: "#e0def4",
    black: "#26233a",
    red: "#eb6f92",
    green: "#9ccfd8",
    yellow: "#f6c177",
    blue: "#31748f",
    magenta: "#c4a7e7",
    cyan: "#9ccfd8",
    white: "#e0def4",
    brightBlack: "#6e6a86",
    brightRed: "#f09aaf",
    brightGreen: "#b3dae1",
    brightYellow: "#f8d09a",
    brightBlue: "#4d8da6",
    brightMagenta: "#d1b8ec",
    brightCyan: "#ebbcba",
    brightWhite: "#e0def4",
  },
  ayuDark: {
    background: "#0b0e14",
    foreground: "#bfbdb6",
    cursor: "#e6b450",
    cursorAccent: "#0b0e14",
    selectionBackground: "rgba(230, 180, 80, 0.2)",
    selectionForeground: "#bfbdb6",
    black: "#0b0e14",
    red: "#d95757",
    green: "#7fd962",
    yellow: "#e6b450",
    blue: "#73b8ff",
    magenta: "#d2a6ff",
    cyan: "#95e6cb",
    white: "#bfbdb6",
    brightBlack: "#565b66",
    brightRed: "#f07178",
    brightGreen: "#94e47a",
    brightYellow: "#ffb454",
    brightBlue: "#8fc8ff",
    brightMagenta: "#ddb8ff",
    brightCyan: "#aaedd8",
    brightWhite: "#d9d7ce",
  },
  everforest: {
    background: "#2d353b",
    foreground: "#d3c6aa",
    cursor: "#a7c080",
    cursorAccent: "#2d353b",
    selectionBackground: "rgba(167, 192, 128, 0.25)",
    selectionForeground: "#d3c6aa",
    black: "#343f44",
    red: "#e67e80",
    green: "#a7c080",
    yellow: "#dbbc7f",
    blue: "#7fbbb3",
    magenta: "#d699b6",
    cyan: "#83c092",
    white: "#d3c6aa",
    brightBlack: "#7a8478",
    brightRed: "#ed9d9f",
    brightGreen: "#b8ce96",
    brightYellow: "#e3ca97",
    brightBlue: "#98ccc4",
    brightMagenta: "#e1acc5",
    brightCyan: "#9dcda6",
    brightWhite: "#ddd0b4",
  },
  githubLight: {
    background: "#ffffff",
    foreground: "#1f2328",
    cursor: "#0969da",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(9, 105, 218, 0.2)",
    selectionForeground: "#1f2328",
    black: "#24292e",
    red: "#cf222e",
    green: "#1a7f37",
    yellow: "#bf8700",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#0550ae",
    white: "#d0d7de",
    brightBlack: "#57606a",
    brightRed: "#a40e26",
    brightGreen: "#116329",
    brightYellow: "#9a6700",
    brightBlue: "#0550ae",
    brightMagenta: "#6639ba",
    brightCyan: "#1b7c83",
    brightWhite: "#f6f8fa",
  },
  solarizedLight: {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#268bd2",
    cursorAccent: "#fdf6e3",
    selectionBackground: "rgba(38, 139, 210, 0.2)",
    selectionForeground: "#657b83",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#6d8f00",
    brightYellow: "#a37700",
    brightBlue: "#1e78c1",
    brightMagenta: "#6c71c4",
    brightCyan: "#1a8b82",
    brightWhite: "#fdf6e3",
  },
};

interface TerminalProps {
  projectPath: string | null;
  onAliveChange?: (alive: boolean) => void;
  /** When true, the terminal is visible and should fit to container */
  visible?: boolean;
}

export const Terminal = memo(function Terminal({ projectPath, onAliveChange, visible = true }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const shellNameRef = useRef<string | null>(null);
  // Track latest projectPath via ref so the spawn timer can read it
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  // Track visibility via ref for output buffering (avoids xterm processing when hidden)
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const outputBufferRef = useRef<string[]>([]);
  const theme = useSettingsStore((s) => s.theme);

  // Inline search bar state
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toggleSearchRef = useRef<() => void>(() => {});

  // Toggle search bar (called from keyboard handler via ref)
  const toggleSearch = useCallback(() => {
    setSearchVisible((v) => {
      if (!v) {
        // Opening: focus input after DOM has painted
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        // Closing: refocus terminal
        xtermRef.current?.focus();
      }
      return !v;
    });
  }, []);
  toggleSearchRef.current = toggleSearch;

  const handleSearchNext = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      try { searchAddonRef.current.findNext(searchQuery); } catch { /* invalid regex */ }
    }
  }, [searchQuery]);

  const handleSearchPrev = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      try { searchAddonRef.current.findPrevious(searchQuery); } catch { /* invalid regex */ }
    }
  }, [searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    xtermRef.current?.focus();
  }, []);

  // Apply theme changes to existing terminal
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = TERMINAL_THEMES[theme];
    }
  }, [theme]);

  // Re-fit when visibility changes (tab switch) and flush buffered output
  useEffect(() => {
    if (visible) {
      // Flush any output that was buffered while hidden
      if (xtermRef.current && outputBufferRef.current.length > 0) {
        const buffered = outputBufferRef.current.join("");
        outputBufferRef.current = [];
        xtermRef.current.write(buffered);
      }
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          /* container not visible yet */
        }
      }
      // Focus terminal after DOM has painted (display:none → block needs a frame)
      requestAnimationFrame(() => {
        xtermRef.current?.focus();
      });
    }
  }, [visible]);

  // Initialize xterm + spawn PTY
  useEffect(() => {
    if (!containerRef.current) return;

    const currentTheme = useSettingsStore.getState().theme;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Symbols Nerd Font Mono", "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"',
      fontWeight: "400",
      fontWeightBold: "700",
      lineHeight: 1.35,
      letterSpacing: 0,
      scrollback: 5000,
      smoothScrollDuration: 0,
      theme: TERMINAL_THEMES[currentTheme],
      allowProposedApi: true,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      minimumContrastRatio: 1,
      drawBoldTextInBrightColors: true,
    });

    // --- Addons ---
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, "_blank");
    });
    term.loadAddon(webLinksAddon);

    // Unicode grapheme clusters — handles CJK width, emoji (skin tone,
    // ZWJ sequences like 👨‍👩‍👧‍👦), and combining characters correctly.
    const unicodeGraphemesAddon = new UnicodeGraphemesAddon();
    term.loadAddon(unicodeGraphemesAddon);
    term.unicode.activeVersion = "15";

    term.open(containerRef.current);

    // Note: WebGL renderer (WebglAddon) was tested but removed because it has
    // weaker font fallback for CJK characters — some glyphs render as boxes.
    // DOM renderer + CSS font-smoothing provides better quality for multilingual content.

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const container = containerRef.current;
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

    // --- Paste handling (with bracketed paste support for vim/nano) ---
    const bracketedPaste = (text: string) => {
      if (!sessionIdRef.current) return;
      const shell = shellNameRef.current;
      // cmd.exe and powershell don't support bracketed paste — send raw text
      if (shell === "cmd" || shell === "cmd.exe" || shell === "pwsh" || shell === "pwsh.exe" || shell === "powershell" || shell === "powershell.exe") {
        ipc.writeTerminal(sessionIdRef.current, text);
      } else {
        // Wrap in bracketed paste sequences so editors (vim, nano) handle it correctly
        ipc.writeTerminal(sessionIdRef.current, `\x1b[200~${text}\x1b[201~`);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const text = e.clipboardData?.getData("text");
      if (text) bracketedPaste(text);
    };
    container.addEventListener("paste", handlePaste, true);

    // --- Keyboard shortcuts ---
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Shift+Enter → send newline (\n) instead of carriage return (\r)
      // Allows apps like Claude Code CLI to distinguish "new line" from "submit"
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        if (sessionIdRef.current) {
          ipc.writeTerminal(sessionIdRef.current, "\n");
        }
        return false;
      }

      // Cmd/Ctrl+V → paste from clipboard
      if (e.key === "v" && (isMac ? e.metaKey : e.ctrlKey)) {
        return false; // Let browser paste event handle it
      }

      // Cmd/Ctrl+C → copy if selection, otherwise pass through (SIGINT)
      if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        const selection = term.getSelection();
        if (selection) {
          e.preventDefault();
          writeText(selection).catch(() => navigator.clipboard.writeText(selection));
          term.clearSelection();
          return false;
        }
        // Ctrl+C without selection → pass to PTY as SIGINT
        if (e.ctrlKey) return true;
        // Cmd+C without selection on macOS → ignore (not a terminal signal)
        return false;
      }

      // Cmd/Ctrl+F → toggle search bar
      if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleSearchRef.current();
        return false;
      }

      // Cmd+K → clear scrollback (macOS convention)
      if (e.key === "k" && e.metaKey) {
        e.preventDefault();
        term.clear();
        return false;
      }

      return true;
    });

    // Right-click → paste from clipboard (with bracketed paste)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!sessionIdRef.current) {
        term.write("\r\n\x1b[33m[Terminal is starting...]\x1b[0m\r\n");
        return;
      }
      readText().then((text) => {
        if (text) bracketedPaste(text);
      }).catch(() => { /* clipboard empty or permission denied */ });
    };
    container.addEventListener("contextmenu", handleContextMenu);

    // Send user keyboard input to PTY
    term.onData((data) => {
      if (sessionIdRef.current) {
        ipc.writeTerminal(sessionIdRef.current, data);
      }
    });

    let disposed = false;

    // Safe fit helper
    const safeFit = () => {
      try { fitAddon.fit(); } catch { /* container not visible */ }
    };

    // Spawn PTY after one animation frame (ensures DOM/layout is ready).
    // projectPath may still be null here; the PTY will start in the default
    // directory and CenterPanel will recreate the terminal once the project loads.
    // Helper to set up event listeners and state after obtaining a session
    const setupSession = (sessionId: string, shellName: string) => {
      if (disposed) {
        ipc.killTerminal(sessionId);
        return;
      }
      sessionIdRef.current = sessionId;
      shellNameRef.current = shellName;
      onAliveChange?.(true);

      // Set up per-session event listeners AFTER we have sessionId
      // When terminal is hidden, buffer output to avoid unnecessary xterm processing
      listen<string>(`terminal-output-${sessionId}`, (event) => {
        if (disposed) return;
        const data = fixGlyphs(event.payload);
        if (visibleRef.current) {
          term.write(data);
        } else {
          // Cap buffer to prevent unbounded memory growth from hidden terminals
          const buf = outputBufferRef.current;
          if (buf.length < 5000) {
            buf.push(data);
          }
        }
      }).then((fn) => {
        if (disposed) { fn(); return; }
        unlistenOutputFn = fn;
      });

      listen<string>(`terminal-exit-${sessionId}`, () => {
        if (disposed) return;
        term.write("\r\n[Process exited]\r\n");
        onAliveChange?.(false);
      }).then((fn) => {
        if (disposed) { fn(); return; }
        unlistenExitFn = fn;
      });

      // Pre-warm next terminal session (fire-and-forget)
      ipc.warmupTerminal(projectPathRef.current ?? undefined).catch(() => {});
    };

    let rafId = requestAnimationFrame(() => {
      if (disposed) return;
      safeFit();
      const path = projectPathRef.current;

      // Try to claim a pre-warmed terminal first, fallback to normal spawn
      ipc.claimWarmupTerminal(path ?? undefined, term.rows, term.cols)
        .then((result) => {
          if (disposed) return;
          if (result) {
            // Got a pre-warmed session — use it immediately
            setupSession(result[0], result[1]);
          } else {
            // No warmup available — normal spawn
            return ipc.spawnTerminal(path ?? undefined, term.rows, term.cols)
              .then(([sessionId, shellName]) => setupSession(sessionId, shellName));
          }
        })
        .catch((err) => {
          if (disposed) return;
          term.write(`\r\n\x1b[31m[Failed to spawn terminal: ${err}]\x1b[0m\r\n`);
          onAliveChange?.(false);
        });
    });

    let unlistenOutputFn: (() => void) | null = null;
    let unlistenExitFn: (() => void) | null = null;

    // Handle resize: fit immediately (prevents font stretching),
    // debounce PTY notification so CLI apps reflow once after drag ends (avoids
    // intermediate SIGWINCH causing rendering artifacts in TUI apps like Claude CLI)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCols = term.cols;
    let lastRows = term.rows;
    const notifyPtyResize = () => {
      if (disposed) return;
      const newCols = term.cols;
      const newRows = term.rows;
      if (newCols !== lastCols || newRows !== lastRows) {
        lastCols = newCols;
        lastRows = newRows;
        if (sessionIdRef.current) {
          ipc.resizeTerminal(sessionIdRef.current, newRows, newCols);
        }
      }
    };
    const onResize = () => {
      // Fit immediately so characters never appear stretched
      safeFit();
      // Debounce PTY resize: only notify after resize settles, so CLI apps
      // receive a single SIGWINCH and produce one clean reflow
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(notifyPtyResize, 100);
    };

    const resizeObserver = new ResizeObserver(() => {
      onResize();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      container.removeEventListener("paste", handlePaste, true);
      container.removeEventListener("contextmenu", handleContextMenu);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (unlistenOutputFn) unlistenOutputFn();
      if (unlistenExitFn) unlistenExitFn();
      // Kill the session on unmount
      if (sessionIdRef.current) {
        ipc.killTerminal(sessionIdRef.current);
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      sessionIdRef.current = null;
      shellNameRef.current = null;
    };
  }, []); // only mount once



  // Debounced search as user types
  useEffect(() => {
    if (!searchVisible || !searchQuery) {
      searchAddonRef.current?.clearDecorations();
      return;
    }
    const timer = setTimeout(() => {
      try { searchAddonRef.current?.findNext(searchQuery); } catch { /* invalid regex */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, searchVisible]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        padding: "8px",
        boxSizing: "border-box",
        background: "var(--bg-primary)",
        display: visible ? "block" : "none",
      }}
    >
      {/* Inline search bar */}
      {searchVisible && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-bar__input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleSearchPrev() : handleSearchNext();
              } else if (e.key === "Escape") {
                closeSearch();
              }
            }}
          />
          <button className="btn btn--ghost btn--sm" onClick={handleSearchPrev} title="Previous">
            <ChevronUp size={14} />
          </button>
          <button className="btn btn--ghost btn--sm" onClick={handleSearchNext} title="Next">
            <ChevronDown size={14} />
          </button>
          <button className="btn btn--ghost btn--sm" onClick={closeSearch} title="Close">
            <X size={14} />
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      />
    </div>
  );
});
