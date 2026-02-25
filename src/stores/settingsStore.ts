import { create } from "zustand";
import type { ProviderConfig } from "../lib/types";
import { DEFAULT_PROVIDERS } from "../lib/types";
import type { EnvCheckResult } from "../ipc/commands";
import * as ipc from "../ipc/commands";

export type Theme =
  | "mocha" | "macchiato" | "frappe" | "latte"
  | "dracula" | "nord" | "tokyoNight" | "oneDark" | "gruvboxDark"
  | "monokai" | "rosePine" | "ayuDark" | "everforest"
  | "githubLight" | "solarizedLight";

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
  theme: Theme;
  onboardingComplete: boolean;
  loading: boolean;
  envCache: EnvCheckResult | null;

  loadSettings: () => Promise<void>;
  preloadEnvCheck: () => void;
  refreshEnvCheck: () => Promise<void>;
  setActiveProvider: (provider: string) => Promise<void>;
  setActiveModel: (model: string) => Promise<void>;
  setActiveMode: (mode: string) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  cycleTheme: () => void;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  saveProviders: (providers: ProviderConfig[]) => Promise<void>;
  hasApiKey: (provider: string) => Promise<boolean>;
  setApiKey: (provider: string, key: string) => Promise<void>;
  deleteApiKey: (provider: string) => Promise<void>;
  testApiKey: (provider: string, key: string, baseUrl?: string) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: DEFAULT_PROVIDERS,
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4",
  activeMode: "code",
  theme: "mocha" as Theme,
  onboardingComplete: false,
  loading: true,
  envCache: null,

  preloadEnvCheck: () => {
    ipc.checkEnvironment().then((result) => {
      set({ envCache: result });
    }).catch(() => {});
  },

  refreshEnvCheck: async () => {
    try {
      const result = await ipc.checkEnvironment();
      set({ envCache: result });
    } catch {
      // ignore
    }
  },

  loadSettings: async () => {
    set({ loading: true });
    try {
      const [providersVal, providerVal, modelVal, modeVal, themeVal, onboardingVal] = await Promise.all([
        ipc.getSetting("providers"),
        ipc.getSetting("active_provider"),
        ipc.getSetting("active_model"),
        ipc.getSetting("active_mode"),
        ipc.getSetting("theme"),
        ipc.getSetting("onboarding_complete"),
      ]);

      const theme = (THEME_ORDER.includes(themeVal as Theme) ? themeVal : "mocha") as Theme;
      document.documentElement.setAttribute("data-theme", theme);

      set({
        providers: (providersVal as ProviderConfig[]) || DEFAULT_PROVIDERS,
        activeProvider: (providerVal as string) || "anthropic",
        activeModel: (modelVal as string) || "claude-sonnet-4",
        activeMode: (modeVal as string) || "code",
        theme,
        onboardingComplete: (onboardingVal as boolean) || false,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
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
