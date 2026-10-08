import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Raised surface for side content. Header is a real heading for navigation by headings. */
export function Panel({
  title,
  titleId,
  action,
  children,
  className,
}: {
  title: string;
  titleId: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={titleId} className={cn("rounded-xl border border-line bg-surface p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
