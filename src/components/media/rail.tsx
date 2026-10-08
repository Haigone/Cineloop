"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Horizontal carousel built on native scrolling (touch, trackpad, keyboard
 * all work). Arrow buttons page by the visible width on pointer devices.
 */
export function Rail({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  function page(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className={cn("group/rail relative", className)}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="scroll-rail -mx-4 flex scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 md:-mx-1 md:scroll-px-1 md:px-1"
      >
        {children}
      </div>
      <RailButton side="left" hidden={edges.start} onClick={() => page(-1)} />
      <RailButton side="right" hidden={edges.end} onClick={() => page(1)} />
    </div>
  );
}

function RailButton({ side, hidden, onClick }: { side: "left" | "right"; hidden: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-[38%] z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface-2/90 text-fg shadow-pop backdrop-blur-md transition-opacity duration-200 hover:bg-surface-3 md:flex",
        side === "left" ? "-left-3" : "-right-3",
        hidden ? "pointer-events-none opacity-0" : "opacity-0 group-hover/rail:opacity-100",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
