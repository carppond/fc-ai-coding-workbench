import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CODING_CLI_INFO } from "../../lib/codingCli";
import { useI18n } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { EnvironmentSetup, type EnvironmentTool } from "./EnvironmentSetup";

interface ToolSetupDialogProps {
  tool: EnvironmentTool;
  onClose: () => void;
}

export function ToolSetupDialog({ tool, onClose }: ToolSetupDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const gitMissing = useSettingsStore((s) => s.envCache?.git_installed === false);
  const name = tool === "git" ? "Git" : CODING_CLI_INFO[tool].label;

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Do not let terminal/editor shortcuts act behind the dialog.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      )].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return createPortal(
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="settings-dialog__header">
          <span className="settings-dialog__title" id={titleId}>{t("env.toolTitle").replace("{tool}", name)}</span>
          <button ref={closeRef} className="btn btn--ghost btn--sm" onClick={onClose} aria-label={t("settings.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="settings-dialog__body">
          <p className="tool-setup__hint">{t("env.toolHint")}</p>
          {tool === "git" && gitMissing && <p className="tool-setup__hint">{t("env.gitCliMissing")}</p>}
          <EnvironmentSetup key={tool} compact tool={tool} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
