import { useI18n } from "../../lib/i18n";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog__title">{title}</div>
        <div className="confirm-dialog__message">{message}</div>
        <div className="confirm-dialog__actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            {t("confirm.cancel")}
          </button>
          <button
            className="btn btn--primary"
            style={{ background: "var(--error)" }}
            onClick={onConfirm}
          >
            {confirmLabel || t("confirm.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
