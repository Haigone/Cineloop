"use client";

import { useId, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/**
 * Single-choice filter row. Implemented as a radio group with roving
 * tabindex: Tab enters once, arrow keys move between options.
 */
export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(index: number, delta: number) {
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("scroll-rail -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0", className)}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors duration-150",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-md border border-line-strong bg-white/[0.07]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{opt.label}</span>
            {opt.count != null && <span className="relative tabular text-xs text-fg-3">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
