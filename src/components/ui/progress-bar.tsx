import { cn } from "@/lib/cn";

interface ProgressBarProps {
  value: number;
  label: string;
  tone?: "accent" | "neutral";
  size?: "xs" | "sm";
  className?: string;
}

/** Thin progress line. `value` is 0–1. */
export function ProgressBar({ value, label, tone = "accent", size = "sm", className }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("w-full overflow-hidden rounded-full bg-white/10", size === "xs" ? "h-[3px]" : "h-1", className)}
    >
      <div
        className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : "bg-fg-2")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
