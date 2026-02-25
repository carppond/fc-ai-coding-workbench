import { useSettingsStore } from "../../stores/settingsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useChatStore } from "../../stores/chatStore";
import { useI18n } from "../../lib/i18n";

export function ProviderModelModeBar() {
  const {
    providers,
    activeProvider,
    activeModel,
    activeMode,
    setActiveProvider,
    setActiveModel,
    setActiveMode,
  } = useSettingsStore();
  const { activeSession, activeThread, createThread, setActiveThread } =
    useSessionStore();
  const { clearMessages } = useChatStore();
  const { t } = useI18n();

  const currentProvider = providers.find((p) => p.id === activeProvider);
  const models = currentProvider?.models || [];
  const currentModel = models.find((m) => m.id === activeModel);
  const modes = currentModel?.modes || ["code", "ask", "architect"];

  const handleProviderChange = async (newProvider: string) => {
    if (newProvider === activeProvider) return;

    await setActiveProvider(newProvider);

    // Provider change -> create new thread with handoff
    if (activeSession && activeThread) {
      const config = providers.find((p) => p.id === newProvider);
      const model = config?.models[0]?.id || "";
      const handoff = JSON.stringify({
        from_provider: activeProvider,
        from_thread: activeThread.id,
      });
      const threadName = t("thread.nameTemplate").replace(
        "{provider}",
        config?.name || newProvider
      );
      const thread = await createThread(
        activeSession.id,
        threadName,
        newProvider,
        model,
        activeMode,
        activeThread.id,
        handoff
      );
      setActiveThread(thread);
      clearMessages();
    }
  };

  const handleModelChange = async (newModel: string) => {
    await setActiveModel(newModel);
    if (activeThread) {
      const { updateThread } = useSessionStore.getState();
      await updateThread(activeThread.id, undefined, newModel);
    }
  };

  const handleModeChange = async (newMode: string) => {
    await setActiveMode(newMode);
    if (activeThread) {
      const { updateThread } = useSessionStore.getState();
      await updateThread(activeThread.id, undefined, undefined, newMode);
    }
  };

  return (
    <div className="composer__provider-bar">
      <select
        className="composer__select"
        value={activeProvider}
        onChange={(e) => handleProviderChange(e.target.value)}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        className="composer__select"
        value={activeModel}
        onChange={(e) => handleModelChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        className="composer__select"
        value={activeMode}
        onChange={(e) => handleModeChange(e.target.value)}
      >
        {modes.map((mode) => (
          <option key={mode} value={mode}>
            {mode}
          </option>
        ))}
      </select>
    </div>
  );
}
