"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";

interface PopoverProps {
  /** Render prop for the trigger so callers control its look and label. */
  trigger: (props: {
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-haspopup": "dialog";
    id: string;
    onClick: () => void;
    ref: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "start" | "end";
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

/** Non-modal popover panel: closes on Esc, outside click, and returns focus. */
export function Popover({ trigger, children, label, align = "end", className, onOpenChange }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function set(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  // Looks the trigger up by id rather than through the ref so it can be handed to render props.
  const close = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
    document.getElementById(`${id}-trigger`)?.focus();
  }, [id, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        set(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) set(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    panelRef.current?.querySelector<HTMLElement>("a, button, [tabindex]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative">
      {trigger({
        "aria-expanded": open,
        "aria-controls": id,
        "aria-haspopup": "dialog",
        id: `${id}-trigger`,
        onClick: () => set(!open),
        ref: triggerRef,
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute top-full z-50 mt-2 origin-top rounded-xl border border-line-strong bg-surface-2 shadow-pop",
              align === "end" ? "right-0" : "left-0",
              className,
            )}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
