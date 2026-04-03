export type ToastTone = "success" | "error" | "warning" | "info" | "loading";

export type ToastOptions = {
  description?: string;
  href?: string;
  linkLabel?: string;
  durationMs?: number | null;
};

export type ToastRecord = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  durationMs: number | null;
};

type ToastListener = (toasts: ToastRecord[]) => void;

const listeners = new Set<ToastListener>();
let toastSequence = 0;
let toastState: ToastRecord[] = [];

function emit() {
  listeners.forEach((listener) => listener(toastState));
}

function nextToastId() {
  toastSequence += 1;
  return Date.now() + toastSequence;
}

function normalizeDuration(tone: ToastTone, durationMs?: number | null) {
  if (durationMs !== undefined) {
    return durationMs;
  }

  switch (tone) {
    case "success":
      return 3000;
    case "error":
      return 5000;
    case "warning":
      return 4000;
    case "info":
      return 4000;
    case "loading":
      return null;
    default:
      return 4000;
  }
}

export function pushToast(
  tone: ToastTone,
  title: string,
  options: ToastOptions = {}
) {
  const toast: ToastRecord = {
    id: nextToastId(),
    tone,
    title,
    description: options.description,
    href: options.href,
    linkLabel: options.linkLabel,
    durationMs: normalizeDuration(tone, options.durationMs)
  };

  toastState = [...toastState, toast];
  emit();
  return toast.id;
}

export function dismiss(id: number) {
  const nextToasts = toastState.filter((toast) => toast.id !== id);
  if (nextToasts.length === toastState.length) {
    return;
  }

  toastState = nextToasts;
  emit();
}

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  listener(toastState);

  return () => {
    listeners.delete(listener);
  };
}

export function getToasts() {
  return toastState;
}

export function success(message: string, options?: ToastOptions) {
  return pushToast("success", message, options);
}

export function error(message: string, options?: ToastOptions) {
  return pushToast("error", message, options);
}

export function warning(message: string, options?: ToastOptions) {
  return pushToast("warning", message, options);
}

export function info(message: string, options?: ToastOptions) {
  return pushToast("info", message, options);
}

export function loading(message: string, options?: ToastOptions) {
  return pushToast("loading", message, { ...options, durationMs: null });
}
