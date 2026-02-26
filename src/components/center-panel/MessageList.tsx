import { useRef, useEffect, useState } from "react";
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

const THROTTLE_MS = 100; // Max ~10 renders/sec during streaming

export function MessageList({
  messages,
  streamingContent,
  isStreaming,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // Throttled content for Markdown rendering during streaming
  const [renderedContent, setRenderedContent] = useState("");
  const lastRenderTimeRef = useRef(0);
  const rafIdRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      // Streaming ended — render final content immediately
      cancelAnimationFrame(rafIdRef.current);
      setRenderedContent(streamingContent);
      lastRenderTimeRef.current = 0;
      return;
    }

    if (!streamingContent) {
      setRenderedContent("");
      return;
    }

    // Throttle: only update renderedContent at most every THROTTLE_MS
    const now = performance.now();
    const elapsed = now - lastRenderTimeRef.current;

    if (elapsed >= THROTTLE_MS) {
      // Enough time has passed — update immediately
      lastRenderTimeRef.current = now;
      setRenderedContent(streamingContent);
    } else {
      // Schedule update on next animation frame after remaining delay
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        lastRenderTimeRef.current = performance.now();
        setRenderedContent(streamingContent);
      });
    }

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [streamingContent, isStreaming]);

  // Scroll: depends on messages (new message added) and throttled renderedContent
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, renderedContent]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}

      {isStreaming && renderedContent && (
        <div className="message-item">
          <div className="message-item__header">
            <span className="message-item__role message-item__role--assistant">
              {t("message.assistant")}
            </span>
          </div>
          <div className="message-item__content">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {renderedContent}
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
