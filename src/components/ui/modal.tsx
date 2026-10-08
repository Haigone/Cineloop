"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "./icon-button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Accessible dialog on top of the native <dialog> element: the browser
 * provides the focus trap, Esc handling and inert background; we restore
 * focus to the trigger on close and add the enter/exit motion.
 */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-visible bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[calc(100dvh-32px)] flex-col rounded-xl border border-line-strong bg-surface shadow-pop"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4">
              <div>
                <h2 id={titleId} className="text-base font-semibold">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-fg-2">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Chiudi" tooltip={false} size="sm" icon={<X aria-hidden className="size-4" />} onClick={onClose} />
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
