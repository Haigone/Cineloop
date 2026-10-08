import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface SectionHeaderProps {
  title: string;
  id?: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function SectionHeader({ title, id, description, href, hrefLabel = "Vedi tutti", action, as: Tag = "h2", className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <Tag id={id} className={cn("font-semibold tracking-[-0.01em] text-fg", Tag === "h1" ? "text-2xl md:text-[28px]" : "text-[17px]")}>
          {title}
        </Tag>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      {action}
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[13px] text-fg-2 transition-colors hover:text-fg">
          {hrefLabel}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
