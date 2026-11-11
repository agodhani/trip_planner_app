'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastApi = {
  push: (message: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Tiny zero-dep toast stack with a single optional action (e.g. Undo). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  const push = useCallback<ToastApi['push']>((message, opts) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-3), { id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }]);
    timers.current.set(id, setTimeout(() => dismiss(id), opts?.durationMs ?? 6000));
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" data-no-print>
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white shadow-lg">
            <span className="min-w-0">{t.message}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="shrink-0 font-medium text-teal-300 hover:text-teal-200"
                onClick={() => { dismiss(t.id); t.onAction?.(); }}
              >
                {t.actionLabel}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="shrink-0 text-neutral-400 hover:text-white" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
