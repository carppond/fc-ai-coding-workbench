import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import { useState, useCallback, memo } from "react";
import type { Message } from "../../lib/types";
import { useI18n } from "../../lib/i18n";

interface MessageItemProps {
  message: Message;
}

function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn--ghost btn--icon"
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          opacity: 0.6,
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <code className={className}>{children}</code>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const { t } = useI18n();
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const roleLabel =
    message.role === "user"
      ? t("message.user")
      : message.role === "assistant"
        ? t("message.assistant")
        : message.role;

  return (
    <div className="message-item">
      <div className="message-item__header">
        <span
          className={`message-item__role message-item__role--${message.role}`}
        >
          {roleLabel}
        </span>
        <span className="message-item__time">{time}</span>
        {message.model && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              background: "var(--bg-surface)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            {message.model}
          </span>
        )}
      </div>
      <div className="message-item__content">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre: ({ children }) => <pre>{children}</pre>,
            code: ({ children, className, ...rest }) => {
              const isInline = !className;
              if (isInline) {
                return <code {...rest}>{children}</code>;
              }
              return <CodeBlock className={className}>{children}</CodeBlock>;
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
});
