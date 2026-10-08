import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label"> {
  /** Required: icon-only controls must be named for assistive tech. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  /** Show the label as a hover/focus tooltip. */
  tooltip?: boolean;
}

export function IconButton({ label, icon, size = "md", tooltip = true, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={cn(
        "group/icon relative inline-flex shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors duration-150 hover:bg-white/[0.06] hover:text-fg disabled:opacity-40",
        size === "md" ? "size-10" : "size-8",
        className,
      )}
    >
      {icon}
      {tooltip && (
        <span
          role="presentation"
          className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-line-strong bg-surface-3 px-2 py-1 text-xs text-fg opacity-0 shadow-pop transition-opacity duration-150 group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100"
        >
          {label}
        </span>
      )}
    </button>
  );
}
