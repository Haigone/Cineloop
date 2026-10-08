import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/** Calm, actionable empty state: what is missing and the one thing to do next. */
export function EmptyState({ icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.04] text-fg-2 ring-1 ring-line-strong [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <p className="max-w-sm text-[15px] font-medium text-fg [text-wrap:balance]">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-2 [text-wrap:pretty]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
