import type { Message } from "../../lib/types";
import { useSessionStore } from "../../stores/sessionStore";
import { useChatStore } from "../../stores/chatStore";
import { useI18n } from "../../lib/i18n";
import { getThread } from "../../ipc/commands";

interface SearchResultsProps {
  results: Message[];
  onClose: () => void;
}

export function SearchResults({ results, onClose }: SearchResultsProps) {
  const { setActiveThread } = useSessionStore();
  const { loadMessages } = useChatStore();
  const { t } = useI18n();

  const handleClick = async (msg: Message) => {
    const thread = await getThread(msg.thread_id);
    if (thread) {
      setActiveThread(thread);
      await loadMessages(thread.id);
    }
    onClose();
  };

  if (results.length === 0) {
    return (
      <div className="search-results">
        <div className="search-results__item">
          <div className="search-results__content" style={{ color: "var(--text-muted)" }}>
            {t("search.noResults")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results">
      {results.slice(0, 20).map((msg) => (
        <div
          key={msg.id}
          className="search-results__item"
          onClick={() => handleClick(msg)}
        >
          <div className="search-results__role">{msg.role}</div>
          <div className="search-results__content">
            {msg.content.slice(0, 120)}
          </div>
        </div>
      ))}
    </div>
  );
}
