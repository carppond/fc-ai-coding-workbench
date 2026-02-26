import { useState, useRef, useCallback } from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../lib/i18n";
import { ProviderModelModeBar } from "./ProviderModelModeBar";
import { ContextInjectBar } from "./ContextInjectBar";

export function Composer() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const status = useChatStore((s) => s.status);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const activeThread = useSessionStore((s) => s.activeThread);
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const activeMode = useSettingsStore((s) => s.activeMode);
  const providers = useSettingsStore((s) => s.providers);
  const { t } = useI18n();

  const isStreaming = status === "streaming" || status === "sending";

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeThread || isStreaming) return;

    const config = providers.find((p) => p.id === activeProvider);
    const baseUrl = config?.baseUrl;

    setInput("");
    await sendMessage(
      activeThread.id,
      input.trim(),
      activeProvider,
      activeModel,
      activeMode,
      baseUrl
    );
  }, [
    input,
    activeThread,
    isStreaming,
    activeProvider,
    activeModel,
    activeMode,
    providers,
    sendMessage,
  ]);

  const handleStop = () => {
    if (activeThread) {
      stopStreaming(activeThread.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInject = (text: string) => {
    setInput((prev) => prev + text);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  const handleInputChange = (val: string) => {
    setInput(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  };

  return (
    <div className="composer">
      <ProviderModelModeBar />
      <ContextInjectBar onInject={handleInject} />
      <div className="composer__input-row" style={{ marginTop: 8 }}>
        <textarea
          ref={textareaRef}
          className="composer__textarea"
          placeholder={
            activeThread
              ? t("composer.placeholderFull")
              : t("composer.noThread")
          }
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!activeThread}
          rows={1}
        />
        {isStreaming ? (
          <button className="btn btn--primary" onClick={handleStop}>
            <Square size={16} />
          </button>
        ) : (
          <button
            className="btn btn--primary"
            onClick={handleSend}
            disabled={!input.trim() || !activeThread}
          >
            <Send size={16} />
          </button>
        )}
      </div>
      <div className="composer__footer">
        <span className="composer__char-count">
          {input.length > 0 ? `${input.length} ${t("composer.chars")}` : ""}
        </span>
        {status === "error" && (
          <span style={{ color: "var(--error)", fontSize: 12 }}>
            {useChatStore.getState().error}
          </span>
        )}
      </div>
    </div>
  );
}
