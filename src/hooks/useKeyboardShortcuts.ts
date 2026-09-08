import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  onNewSession?: () => void;
  onSend?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(".xterm"))) return;
      const isMeta = e.metaKey || e.ctrlKey;
      const h = ref.current;

      // Cmd+N: New Session
      if (isMeta && e.key === "n") {
        e.preventDefault();
        h.onNewSession?.();
      }

      // Cmd+Enter: Send message
      if (isMeta && e.key === "Enter") {
        e.preventDefault();
        h.onSend?.();
      }

      // Cmd+K: Focus search
      if (isMeta && e.key === "k") {
        e.preventDefault();
        h.onSearch?.();
      }

      // Escape
      if (e.key === "Escape") {
        h.onEscape?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
