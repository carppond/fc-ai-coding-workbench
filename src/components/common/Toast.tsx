import { useState, useCallback, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "error" | "success";
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: "info" | "error" | "success") => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const TOAST_DURATION = 3000;
const EXIT_DURATION = 300;

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (item.exiting) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        requestAnimationFrame(tick);
      }
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item.exiting]);

  const icon =
    item.type === "success" ? <CheckCircle2 size={16} /> :
    item.type === "error" ? <AlertCircle size={16} /> :
    <Info size={16} />;

  return (
    <div className={`toast toast--${item.type} ${item.exiting ? "toast--exit" : ""}`}>
      <span className="toast__icon">{icon}</span>
      <span className="toast__message">{item.message}</span>
      <button className="toast__close" onClick={() => onDismiss(item.id)}>
        <X size={14} />
      </button>
      <div className="toast__progress">
        <div
          className={`toast__progress-bar toast__progress-bar--${item.type}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, []);

  const toast = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
