import { useRef, useEffect } from "react";
import type { Message } from "../../lib/types";
import { MessageItem } from "./MessageItem";
import { useI18n } from "../../lib/i18n";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
}

export function MessageList({
  messages,
  streamingContent,
  isStreaming,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}

      {isStreaming && streamingContent && (
        <div className="message-item">
          <div className="message-item__header">
            <span className="message-item__role message-item__role--assistant">
              {t("message.assistant")}
            </span>
          </div>
          <div className="message-item__content">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {streamingContent}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && (
        <div className="streaming-indicator">
          <div className="streaming-indicator__dot" />
          {t("message.thinking")}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
