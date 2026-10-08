"use client";

import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Id of the element that names the switch. */
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

/** On/off control with the ARIA switch role. The label lives outside, wired via aria-labelledby. */
export function Switch({ checked, onChange, labelledBy, describedBy, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 ease-out-soft disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-line-strong bg-white/[0.06] hover:bg-white/[0.1]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-[3px] size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.4)] transition-transform duration-200 ease-out-soft",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}
