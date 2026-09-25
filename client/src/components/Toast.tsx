import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; error?: boolean; action?: { label: string; onClick: () => void } };
const Ctx = createContext<(text: string, action?: Toast['action']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { ...toast, id }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.action ? 6000 : toast.error ? 5000 : 3200);
  }, []);
  const show = useCallback((text: string, action?: Toast['action']) => push({ text, action }), [push]);
  const value = useMemo(() => show, [show]);

  // Refused changes arrive from the query client as a window event (see main.tsx).
  useEffect(() => {
    const onError = (e: Event) => push({ text: String((e as CustomEvent).detail), error: true });
    window.addEventListener('lar-error', onError);
    return () => window.removeEventListener('lar-error', onError);
  }, [push]);

  // Toasts live in the top layer so they show above open sheets, which are modal dialogs.
  useEffect(() => {
    const el = host.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover) return;
    try {
      if (el.matches(':popover-open')) el.hidePopover!();
      if (toasts.length) el.showPopover();
    } catch {
      /* popover unsupported: the fixed-position host still shows outside dialogs */
    }
  }, [toasts]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div ref={host} className="toast-host" aria-live="polite" {...{ popover: 'manual' }}>
        {toasts.map((t) => (
          <div key={t.id} className={t.error ? 'toast error' : 'toast'} role={t.error ? 'alert' : undefined}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
