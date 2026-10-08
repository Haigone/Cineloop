import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Native select (best keyboard and mobile behaviour) with a visible label. */
export function Select({ label, className, children, id, ...rest }: ComponentProps<"select"> & { label: string }) {
  const selectId = id ?? `select-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={selectId} className="shrink-0 text-[13px] text-fg-3">
        {label}
      </label>
      <span className="relative">
        <select
          id={selectId}
          {...rest}
          className="h-8 appearance-none rounded-md border border-line-strong bg-white/[0.03] pr-8 pl-3 text-[13px] text-fg transition-colors hover:border-white/20"
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
      </span>
    </div>
  );
}
