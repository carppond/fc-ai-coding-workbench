import { useState, useCallback, createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../../lib/i18n";
import appIcon from "../../assets/app-icon.png";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: "info" | "warning";
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState(opts);
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__header">
              <img src={appIcon} alt="" className="confirm-dialog__icon" />
              {state.title && (
                <div className="confirm-dialog__title">{state.title}</div>
              )}
            </div>
            <div className="confirm-dialog__message">{state.message}</div>
            <div className="confirm-dialog__actions">
              <button className="btn btn--ghost" onClick={handleCancel}>
                {state.cancelLabel || t("confirm.cancel")}
              </button>
              <button className="btn btn--primary" onClick={handleConfirm}>
                {state.confirmLabel || t("confirm.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
