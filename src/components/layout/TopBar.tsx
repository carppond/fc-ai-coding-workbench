import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Globe, Palette, Settings, X, Info, BookOpen } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../lib/i18n";
import { EnvironmentSetup } from "../common/EnvironmentSetup";
import { GuideModal } from "../common/GuideModal";
import * as ipc from "../../ipc/commands";

function ProxySettings() {
  const { t } = useI18n();
  const [proxyUrl, setProxyUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "cleared">("idle");

  useEffect(() => {
    ipc.getProxy().then((url) => {
      const val = url ?? "";
      setProxyUrl(val);
      setSavedUrl(val);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "idle") {
      const id = setTimeout(() => setStatus("idle"), 2000);
      return () => clearTimeout(id);
    }
  }, [status]);

  const handleSave = useCallback(async () => {
    try {
      await ipc.setProxy(proxyUrl.trim());
      setSavedUrl(proxyUrl.trim());
      setStatus("saved");
    } catch {
      // ignore
    }
  }, [proxyUrl]);

  const handleClear = useCallback(async () => {
    try {
      await ipc.setProxy("");
      setProxyUrl("");
      setSavedUrl("");
      setStatus("cleared");
    } catch {
      // ignore
    }
  }, []);

  const isDirty = proxyUrl.trim() !== savedUrl;

  const isActive = savedUrl.length > 0;

  return (
    <div className="proxy-settings">
      <div className="proxy-settings__status-row">
        <label className="proxy-settings__label">{t("proxy.url")}</label>
        <span className={`proxy-settings__badge ${isActive ? "proxy-settings__badge--on" : "proxy-settings__badge--off"}`}>
          {isActive ? t("proxy.enabled") : t("proxy.disabled")}
        </span>
      </div>
      <div className="proxy-settings__row">
        <input
          type="text"
          className="proxy-settings__input"
          placeholder={t("proxy.urlPlaceholder")}
          value={proxyUrl}
          onChange={(e) => setProxyUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && isDirty) handleSave(); }}
        />
        <button
          className="btn btn--primary btn--sm"
          onClick={handleSave}
          disabled={!isDirty && proxyUrl.trim().length === 0}
        >
          {t("proxy.save")}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handleClear}
          disabled={!savedUrl && !proxyUrl.trim()}
        >
          {t("proxy.clear")}
        </button>
      </div>
      {status !== "idle" && (
        <div className="proxy-settings__status">
          {status === "saved" ? t("proxy.saved") : t("proxy.cleared")}
        </div>
      )}
      <div className="proxy-settings__hint">
        <Info size={12} />
        <span>{t("proxy.hint")}</span>
      </div>
    </div>
  );
}

function ClaudeResumeSettings({ platform }: { platform: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    ipc.getClaudeResumeEnabled().then((v) => {
      setEnabled(v);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(""), 3000);
      return () => clearTimeout(id);
    }
  }, [message]);

  if (platform === "windows") return null;

  const handleToggle = async () => {
    try {
      const newVal = !enabled;
      const path = await ipc.setClaudeResumeEnabled(newVal);
      setEnabled(newVal);
      setMessage(
        newVal
          ? t("resume.saved").replace("{path}", path)
          : t("resume.removed").replace("{path}", path)
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="proxy-settings">
      <div className="proxy-settings__status-row">
        <label className="proxy-settings__label">{t("resume.desc")}</label>
        <span className={`proxy-settings__badge ${enabled ? "proxy-settings__badge--on" : "proxy-settings__badge--off"}`}>
          {enabled ? t("resume.enabled") : t("resume.disabled")}
        </span>
      </div>
      <div className="proxy-settings__row">
        <button
          className={`btn btn--sm ${enabled ? "btn--ghost" : "btn--primary"}`}
          style={enabled ? { background: "var(--bg-hover)" } : undefined}
          onClick={handleToggle}
          disabled={loading}
        >
          {enabled ? t("resume.turnOff") : t("resume.turnOn")}
        </button>
      </div>
      {message && (
        <div className="proxy-settings__status">{message}</div>
      )}
    </div>
  );
}

function FontSizeSettings() {
  const { t } = useI18n();
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const chatFontSize = useSettingsStore((s) => s.chatFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const setTerminalFontSize = useSettingsStore((s) => s.setTerminalFontSize);
  const setChatFontSize = useSettingsStore((s) => s.setChatFontSize);

  const controls = [
    { label: t("fontSize.editor"), value: editorFontSize, onChange: setEditorFontSize },
    { label: t("fontSize.terminal"), value: terminalFontSize, onChange: setTerminalFontSize },
    { label: t("fontSize.chat"), value: chatFontSize, onChange: setChatFontSize },
  ];

  return (
    <div className="font-settings">
      {controls.map(({ label, value, onChange }) => (
        <div key={label} className="font-settings__row">
          <label className="font-settings__label">{label}</label>
          <div className="font-settings__control">
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className="font-settings__slider"
            />
            <span className="font-settings__value">{value}px</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShortcutsReference() {
  const { t } = useI18n();
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = isMac ? "Command" : "Ctrl";
  const shift = "Shift";

  const groups = [
    {
      title: t("shortcuts.global"),
      items: [
        { keys: `${mod} + P`, desc: t("shortcuts.quickOpen") },
        { keys: `${mod} + N`, desc: t("shortcuts.newSession") },
        { keys: `${mod} + Enter`, desc: t("shortcuts.send") },
        { keys: `${mod} + K`, desc: t("shortcuts.focusSearch") },
        { keys: "Escape", desc: t("shortcuts.close") },
      ],
    },
    {
      title: t("shortcuts.editor"),
      items: [
        { keys: `${mod} + S`, desc: t("shortcuts.save") },
        { keys: "Tab", desc: t("shortcuts.indent") },
        { keys: `${mod} + Z`, desc: t("shortcuts.undo") },
        { keys: `${shift} + ${mod} + Z`, desc: t("shortcuts.redo") },
        { keys: `${mod} + F`, desc: t("shortcuts.find") },
      ],
    },
    {
      title: t("shortcuts.terminal"),
      items: [
        { keys: `${mod} + F`, desc: t("shortcuts.termSearch") },
        { keys: `${mod} + K`, desc: t("shortcuts.termClear") },
        { keys: `${mod} + C`, desc: t("shortcuts.termCopy") },
        { keys: `${mod} + V`, desc: t("shortcuts.termPaste") },
        { keys: `${shift} + Enter`, desc: t("shortcuts.termNewline") },
      ],
    },
    {
      title: t("shortcuts.chat"),
      items: [
        { keys: "Enter", desc: t("shortcuts.chatSend") },
        { keys: `${shift} + Enter`, desc: t("shortcuts.chatNewline") },
      ],
    },
    {
      title: t("shortcuts.git"),
      items: [
        { keys: `${mod} + Enter`, desc: t("shortcuts.gitCommit") },
      ],
    },
  ];

  return (
    <div className="shortcuts-ref">
      {groups.map((group) => (
        <div key={group.title} className="shortcuts-ref__group">
          <div className="shortcuts-ref__group-title">{group.title}</div>
          <div className="shortcuts-ref__list">
            {group.items.map((item) => (
              <div key={item.keys + item.desc} className="shortcuts-ref__item">
                <span className="shortcuts-ref__desc">{item.desc}</span>
                <kbd className="shortcuts-ref__kbd">{item.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TopBar() {
  const { openProject } = useProjectStore();
  const { loading, theme, cycleTheme, envCache } = useSettingsStore();
  const { t, toggleLocale, locale } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (loading) return null;

  return (
    <>
      <div className="top-bar">
        <span className="top-bar__title">{t("topbar.title")}</span>

        <div className="top-bar__project" onClick={openProject}>
          <FolderOpen size={14} />
          <span className="top-bar__project-name">
            {t("topbar.openProject")}
          </span>
        </div>

        <div className="top-bar__spacer" />

        <button
          className="top-bar__btn"
          onClick={cycleTheme}
          title={`${t("topbar.switchTheme")} (${theme})`}
          style={{ fontSize: 11, fontWeight: 500, width: "auto", gap: 4, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}
        >
          <Palette size={15} color="var(--text-secondary)" />
          <span style={{ color: "var(--text-muted)" }}>{t("topbar.switchTheme")}</span>
        </button>

        <button
          className="top-bar__btn"
          onClick={toggleLocale}
          title={locale === "zh" ? "Switch to English" : "切换到中文"}
          style={{ fontSize: 13, fontWeight: 500, minWidth: 40 }}
        >
          <Globe size={16} color="var(--text-secondary)" />
        </button>

        <button
          className="top-bar__btn"
          onClick={() => setShowGuide(true)}
          title={t("guide.title")}
          style={{ fontSize: 13, fontWeight: 500, minWidth: 32 }}
        >
          <BookOpen size={16} color="var(--text-secondary)" />
        </button>

        <button
          className="top-bar__btn"
          onClick={() => setShowSettings(true)}
          title={t("settings.title")}
          style={{ fontSize: 13, fontWeight: 500, minWidth: 32 }}
        >
          <Settings size={16} color="var(--text-secondary)" />
        </button>
      </div>

      <GuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      {/* Settings Dialog */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog__header">
              <span className="settings-dialog__title">{t("settings.title")}</span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="settings-dialog__body">
              <div className="settings-dialog__section">
                <div className="settings-dialog__section-title">
                  {t("settings.proxy")}
                </div>
                <ProxySettings />
              </div>
              {envCache?.platform !== "windows" && (
                <div className="settings-dialog__section">
                  <div className="settings-dialog__section-title">
                    {t("resume.title")}
                  </div>
                  <ClaudeResumeSettings platform={envCache?.platform ?? ""} />
                </div>
              )}
              <div className="settings-dialog__section">
                <div className="settings-dialog__section-title">
                  {t("settings.environment")}
                </div>
                <EnvironmentSetup compact preloadedEnv={envCache} />
              </div>
              <div className="settings-dialog__section">
                <div className="settings-dialog__section-title">
                  {t("fontSize.title")}
                </div>
                <FontSizeSettings />
              </div>
              <div className="settings-dialog__section">
                <div className="settings-dialog__section-title">
                  {t("shortcuts.title")}
                </div>
                <ShortcutsReference />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
