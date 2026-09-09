export type TerminalHostKey = "c" | "v" | "f" | "k" | "w";

/** Leave Ctrl-only editing/model shortcuts to the CLI on Windows and Linux. */
export function isTerminalHostShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  key: TerminalHostKey,
  isMac: boolean,
): boolean {
  if (event.key.toLowerCase() !== key || event.altKey) return false;
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && event.shiftKey && !event.metaKey;
}
