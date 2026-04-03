import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LoaderCircle,
  OctagonX,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  dismiss,
  getToasts,
  pushToast,
  subscribeToToasts,
  type ToastRecord
} from "@/lib/toast";

type ToastContextValue = {
  pushToast: (toast: {
    title: string;
    description?: string;
    href?: string;
    linkLabel?: string;
  }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>(() => getToasts());

  const pushToastLegacy = useCallback((toast: {
    title: string;
    description?: string;
    href?: string;
    linkLabel?: string;
  }) => {
    pushToast("success", toast.title, {
      description: toast.description,
      href: toast.href,
      linkLabel: toast.linkLabel
    });
  }, []);

  useEffect(() => {
    return subscribeToToasts(setToasts);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.sessionStorage.getItem("lojacelular.pending-toast");
    if (!raw) {
      return;
    }

    window.sessionStorage.removeItem("lojacelular.pending-toast");

    try {
      const parsed = JSON.parse(raw) as {
        title?: string;
        description?: string;
      };

      if (parsed.title) {
        pushToast("error", parsed.title, {
          description: parsed.description
        });
      }
    } catch {
      // ignore invalid persisted toast payloads
    }
  }, []);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }

    const timers = toasts
      .filter((toast) => typeof toast.durationMs === "number" && toast.durationMs > 0)
      .map((toast) =>
        window.setTimeout(() => {
          dismiss(toast.id);
        }, toast.durationMs ?? 0)
      );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  const value = useMemo(() => ({ pushToast: pushToastLegacy }), [pushToastLegacy]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            className="pointer-events-auto rounded-[var(--radius-card)] border bg-slate-950/92 p-4 shadow-2xl backdrop-blur"
            key={toast.id}
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)"
            }}
          >
            <div className="flex items-start gap-3">
              <ToastToneIcon tone={toast.tone} />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 text-sm leading-5" style={{ color: "var(--color-text-muted)" }}>
                    {toast.description}
                  </p>
                ) : null}
                {toast.href ? (
                  <Link
                    className="mt-3 inline-flex text-sm font-semibold text-primary"
                    onClick={() => dismiss(toast.id)}
                    to={toast.href}
                  >
                    {toast.linkLabel ?? "Ver registro"}
                  </Link>
                ) : null}
              </div>

              <button
                aria-label="Fechar toast"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }

  return context;
}

function ToastToneIcon({ tone }: { tone: ToastRecord["tone"] }) {
  const iconClassName = "h-4 w-4";

  if (tone === "error") {
    return (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300">
        <OctagonX className={iconClassName} />
      </div>
    );
  }

  if (tone === "warning") {
    return (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
        <AlertTriangle className={iconClassName} />
      </div>
    );
  }

  if (tone === "info") {
    return (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
        <Info className={iconClassName} />
      </div>
    );
  }

  if (tone === "loading") {
    return (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <LoaderCircle className={`${iconClassName} animate-spin`} />
      </div>
    );
  }

  return (
    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
      <CheckCircle2 className={iconClassName} />
    </div>
  );
}
