import { useEffect } from "react";

interface ShortcutHandlers {
  onNewSession?: () => void;
  onSend?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+N: New Session
      if (isMeta && e.key === "n") {
        e.preventDefault();
        handlers.onNewSession?.();
      }

      // Cmd+Enter: Send message
      if (isMeta && e.key === "Enter") {
        e.preventDefault();
        handlers.onSend?.();
      }

      // Cmd+K: Focus search
      if (isMeta && e.key === "k") {
        e.preventDefault();
        handlers.onSearch?.();
      }

      // Escape
      if (e.key === "Escape") {
        handlers.onEscape?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
