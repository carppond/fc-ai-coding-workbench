import { create } from "zustand";
import type { ProviderConfig } from "../lib/types";
import { DEFAULT_PROVIDERS } from "../lib/types";
import type { EnvCheckResult, CliUpdateResult } from "../ipc/commands";
import { CODING_CLI_IDS, type CodingCli, type OmpApprovalMode } from "../lib/codingCli";
import * as ipc from "../ipc/commands";

export type Theme =
  | "mocha" | "macchiato" | "frappe" | "latte"
  | "dracula" | "nord" | "tokyoNight" | "oneDark" | "gruvboxDark"
  | "monokai" | "rosePine" | "ayuDark" | "everforest"
  | "githubLight" | "solarizedLight";

export type TerminalRenderer = "dom" | "webgl";

const THEME_ORDER: Theme[] = [
  "mocha", "macchiato", "frappe",
  "dracula", "nord", "tokyoNight", "oneDark", "gruvboxDark",
  "monokai", "rosePine", "ayuDark", "everforest",
  "latte", "githubLight", "solarizedLight",
];

interface SettingsState {
  providers: ProviderConfig[];
  activeProvider: string;
  activeModel: string;
  activeMode: string;
  codingCli: CodingCli;
  ompApprovalMode: OmpApprovalMode;
  theme: Theme;
  editorFontSize: number;
  terminalFontSize: number;
  chatFontSize: number;
  terminalScrollback: number;
  terminalLineHeight: number;
  terminalRenderer: TerminalRenderer;
  onboardingComplete: boolean;
  loading: boolean;
  envCache: EnvCheckResult | null;
  envChecking: boolean;
  envError: string | null;
  cliUpdates: Partial<Record<CodingCli, CliUpdateResult>>;
  cliUpdateChecking: Partial<Record<CodingCli, boolean>>;
  cliUpdateErrors: Partial<Record<CodingCli, string>>;

  loadSettings: () => Promise<void>;
  preloadEnvCheck: () => void;
  loadEnvironment: () => Promise<void>;
  refreshEnvCheck: () => Promise<void>;
  setCodingCli: (cli: CodingCli) => Promise<void>;
  setOmpApprovalMode: (mode: OmpApprovalMode) => Promise<void>;
  setActiveProvider: (provider: string) => Promise<void>;
  setActiveModel: (model: string) => Promise<void>;
  setActiveMode: (mode: string) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  cycleTheme: () => void;
  setEditorFontSize: (size: number) => Promise<void>;
  setTerminalFontSize: (size: number) => Promise<void>;
  setChatFontSize: (size: number) => Promise<void>;
  setTerminalScrollback: (lines: number) => Promise<void>;
  setTerminalLineHeight: (height: number) => Promise<void>;
  setTerminalRenderer: (renderer: TerminalRenderer) => Promise<void>;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  saveProviders: (providers: ProviderConfig[]) => Promise<void>;
  hasApiKey: (provider: string) => Promise<boolean>;
  setApiKey: (provider: string, key: string) => Promise<void>;
  deleteApiKey: (provider: string) => Promise<void>;
  testApiKey: (provider: string, key: string, baseUrl?: string) => Promise<boolean>;
}

let environmentRequest: Promise<void> | null = null;
let environmentRefreshRequest: Promise<void> | null = null;
const cliUpdateRequests: Partial<Record<CodingCli, Promise<void>>> = {};
let environmentGeneration = 0;

function environmentErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: DEFAULT_PROVIDERS,
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4",
  activeMode: "code",
  codingCli: "omp",
  ompApprovalMode: "default",
  theme: "mocha" as Theme,
  editorFontSize: 13,
  terminalFontSize: 14,
  chatFontSize: 14,
  terminalScrollback: 5000,
  terminalLineHeight: 1.35,
  terminalRenderer: "dom",
  onboardingComplete: false,
  loading: true,
  envCache: null,
  envChecking: false,
  envError: null,
  cliUpdates: {},
  cliUpdateChecking: {},
  cliUpdateErrors: {},

  preloadEnvCheck: () => {
    void get().loadEnvironment();
  },

  loadEnvironment: () => {
    if (environmentRequest) return environmentRequest;
    if (get().envCache) return Promise.resolve();
    const generation = ++environmentGeneration;
    set({ envChecking: true, envError: null });
    environmentRequest = ipc.checkEnvironment().then((result) => {
      if (generation !== environmentGeneration) return;
      set({ envCache: result });
      // Local readiness never waits for remote metadata. Each CLI has its own
      // serialized request, and old snapshots cannot publish into a refresh.
      for (const cli of CODING_CLI_IDS) {
        const status = result.clis[cli];
        if (!status.installed || !status.version) continue;
        const version = status.version;
        set((state) => ({
          cliUpdateChecking: { ...state.cliUpdateChecking, [cli]: true },
        }));
        const checkUpdate = async () => {
          if (cliUpdateRequests[cli]) await cliUpdateRequests[cli];
          if (generation !== environmentGeneration) return;
          const request = ipc.checkCliUpdate(cli, version).then((update) => {
            if (generation === environmentGeneration) {
              set((state) => ({ cliUpdates: { ...state.cliUpdates, [cli]: update } }));
            }
          }).catch((error: unknown) => {
            if (generation === environmentGeneration) {
              set((state) => ({
                cliUpdateErrors: { ...state.cliUpdateErrors, [cli]: environmentErrorMessage(error) },
              }));
            }
          }).finally(() => {
            if (generation === environmentGeneration) {
              set((state) => ({
                cliUpdateChecking: { ...state.cliUpdateChecking, [cli]: false },
              }));
            }
          });
          cliUpdateRequests[cli] = request;
          await request;
          if (cliUpdateRequests[cli] === request) delete cliUpdateRequests[cli];
        };
        void checkUpdate();
      }
    }).catch((error: unknown) => {
      if (generation === environmentGeneration) {
        set({ envError: environmentErrorMessage(error) });
      }
    }).finally(() => {
      if (generation === environmentGeneration) set({ envChecking: false });
      environmentRequest = null;
    });
    return environmentRequest;
  },

  refreshEnvCheck: () => {
    if (environmentRefreshRequest) return environmentRefreshRequest;
    environmentRefreshRequest = (async () => {
      // Invalidate immediately: late local and remote replies from before an
      // installation must not become visible while we wait for a fresh check.
      environmentGeneration++;
      set({
        envCache: null,
        envError: null,
        envChecking: true,
        cliUpdates: {},
        cliUpdateChecking: {},
        cliUpdateErrors: {},
      });
      if (environmentRequest) await environmentRequest;
      await get().loadEnvironment();
    })().finally(() => {
      environmentRefreshRequest = null;
    });
    return environmentRefreshRequest;
  },

  loadSettings: async () => {
    set({ loading: true });
    try {
      const [providersVal, providerVal, modelVal, modeVal, themeVal, onboardingVal, editorFsVal, terminalFsVal, chatFsVal, scrollbackVal, lineHeightVal, rendererVal, codingCliVal, approvalModeVal] = await Promise.all([
        ipc.getSetting("providers"),
        ipc.getSetting("active_provider"),
        ipc.getSetting("active_model"),
        ipc.getSetting("active_mode"),
        ipc.getSetting("theme"),
        ipc.getSetting("onboarding_complete"),
        ipc.getSetting("editor_font_size"),
        ipc.getSetting("terminal_font_size"),
        ipc.getSetting("chat_font_size"),
        ipc.getSetting("terminal_scrollback"),
        ipc.getSetting("terminal_line_height"),
        ipc.getSetting("terminal_renderer"),
        ipc.getSetting("coding_cli"),
        ipc.getSetting("omp_approval_mode"),
      ]);

      const theme = (THEME_ORDER.includes(themeVal as Theme) ? themeVal : "mocha") as Theme;
      document.documentElement.setAttribute("data-theme", theme);

      const clampFs = (v: unknown, def: number) => {
        const n = typeof v === "number" ? v : def;
        return Math.max(10, Math.min(24, n));
      };
      const editorFontSize = clampFs(editorFsVal, 13);
      const terminalFontSize = clampFs(terminalFsVal, 14);
      const chatFontSize = clampFs(chatFsVal, 14);
      const terminalScrollback = typeof scrollbackVal === "number"
        ? Math.max(1000, Math.min(999999, scrollbackVal)) : 5000;
      const terminalLineHeight = typeof lineHeightVal === "number"
        ? Math.max(1.0, Math.min(2.0, lineHeightVal)) : 1.35;
      const terminalRenderer: TerminalRenderer = rendererVal === "webgl" ? "webgl" : "dom";
      document.documentElement.style.setProperty("--chat-font-size", chatFontSize + "px");

      set({
        providers: (providersVal as ProviderConfig[]) || DEFAULT_PROVIDERS,
        activeProvider: (providerVal as string) || "anthropic",
        activeModel: (modelVal as string) || "claude-sonnet-4",
        activeMode: (modeVal as string) || "code",
        codingCli: codingCliVal === "pi" ? "pi" : "omp",
        ompApprovalMode: approvalModeVal === "always-ask" || approvalModeVal === "auto-approve"
          ? approvalModeVal : "default",
        theme,
        editorFontSize,
        terminalFontSize,
        chatFontSize,
        terminalScrollback,
        terminalLineHeight,
        terminalRenderer,
        onboardingComplete: (onboardingVal as boolean) || false,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setCodingCli: async (cli) => {
    await ipc.setSetting("coding_cli", cli);
    set({ codingCli: cli });
  },

  setOmpApprovalMode: async (mode) => {
    await ipc.setSetting("omp_approval_mode", mode);
    set({ ompApprovalMode: mode });
  },

  setActiveProvider: async (provider) => {
    set({ activeProvider: provider });
    await ipc.setSetting("active_provider", provider);
    // Reset model to first available for this provider
    const config = get().providers.find((p) => p.id === provider);
    if (config && config.models.length > 0) {
      const model = config.models[0].id;
      set({ activeModel: model });
      await ipc.setSetting("active_model", model);
    }
  },

  setActiveModel: async (model) => {
    set({ activeModel: model });
    await ipc.setSetting("active_model", model);
  },

  setActiveMode: async (mode) => {
    set({ activeMode: mode });
    await ipc.setSetting("active_mode", mode);
  },

  setTheme: async (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
    await ipc.setSetting("theme", theme);
  },

  cycleTheme: () => {
    const current = get().theme;
    const idx = THEME_ORDER.indexOf(current);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    get().setTheme(next);
  },

  setEditorFontSize: async (size) => {
    set({ editorFontSize: size });
    await ipc.setSetting("editor_font_size", size);
  },

  setTerminalFontSize: async (size) => {
    set({ terminalFontSize: size });
    await ipc.setSetting("terminal_font_size", size);
  },

  setChatFontSize: async (size) => {
    document.documentElement.style.setProperty("--chat-font-size", size + "px");
    set({ chatFontSize: size });
    await ipc.setSetting("chat_font_size", size);
  },

  setTerminalScrollback: async (lines) => {
    set({ terminalScrollback: lines });
    await ipc.setSetting("terminal_scrollback", lines);
  },

  setTerminalLineHeight: async (height) => {
    set({ terminalLineHeight: height });
    await ipc.setSetting("terminal_line_height", height);
  },

  setTerminalRenderer: async (renderer) => {
    set({ terminalRenderer: renderer });
    await ipc.setSetting("terminal_renderer", renderer);
  },

  setOnboardingComplete: async (complete) => {
    set({ onboardingComplete: complete });
    await ipc.setSetting("onboarding_complete", complete);
  },

  saveProviders: async (providers) => {
    set({ providers });
    await ipc.setSetting("providers", providers);
  },

  hasApiKey: (provider) => ipc.hasApiKey(provider),
  setApiKey: (provider, key) => ipc.setApiKey(provider, key),
  deleteApiKey: (provider) => ipc.deleteApiKey(provider),
  testApiKey: (provider, key, baseUrl) => ipc.testApiKey(provider, key, baseUrl),
}));
