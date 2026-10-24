import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** One row of the fixed notices under the top bar: icon, message and a single action. */
export function NoticeBar({ icon: Icon, title, children, href, action }: { icon: LucideIcon; title: string; children: React.ReactNode; href?: string; action?: string }) {
  return (
    <div role="status" className="border-b border-warning/25 bg-[#1d1710]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6 lg:px-8">
        <Icon aria-hidden className="size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-sm text-fg-2">
          <span className="font-medium text-fg">{title}</span> {children}
        </p>
        {href && action && (
          <Link
            href={href}
            className="shrink-0 rounded-md bg-accent-fill px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-fill-hover"
          >
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}
