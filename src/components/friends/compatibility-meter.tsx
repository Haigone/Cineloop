import { cn } from "@/lib/cn";

/** Taste compatibility as a short violet meter: a social signal, so not the primary accent. */
export function CompatibilityMeter({ value, className, size = "sm" }: { value: number; className?: string; size?: "sm" | "lg" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="meter"
        aria-label="Affinità di gusti"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className={cn("flex-1 overflow-hidden rounded-full bg-white/10", size === "lg" ? "h-1.5" : "h-1")}
      >
        <div className="h-full rounded-full bg-violet" style={{ width: `${value}%` }} />
      </div>
      <span className={cn("tabular text-fg", size === "lg" ? "text-xl font-semibold" : "text-xs")}>{value}%</span>
    </div>
  );
}
