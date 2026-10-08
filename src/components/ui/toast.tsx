"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; action?: ToastItem["action"] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, options) => {
      const id = ++nextId.current;
      setItems((xs) => [...xs.slice(-2), { id, message, tone: options?.tone ?? "success", action: options?.action }]);
      window.setTimeout(() => dismiss(id), options?.action ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-line-strong bg-surface-2/95 py-2.5 pr-2 pl-3 text-sm shadow-pop backdrop-blur-md"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  t.tone === "error" ? "bg-accent-soft text-accent" : "bg-white/10 text-fg",
                )}
              >
                {t.tone === "error" ? <TriangleAlert className="size-3" /> : <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 text-fg">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="rounded-sm px-2 py-1 text-[13px] font-medium text-accent hover:text-accent-hover"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Chiudi notifica"
                onClick={() => dismiss(t.id)}
                className="rounded-sm p-1 text-fg-3 hover:text-fg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}
