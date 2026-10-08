"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface Column {
  label: string;
  value: number;
  display: string;
}

/**
 * Small single-series column chart. Hover or focus shows the exact value;
 * a visually hidden table carries the same data for screen readers.
 */
export function ColumnChart({ columns, caption, highlightLast = false, height = 120 }: { columns: Column[]; caption: string; highlightLast?: boolean; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...columns.map((c) => c.value), 1);
  return (
    <figure>
      <div className="relative flex items-end gap-1.5" style={{ height }} aria-hidden onMouseLeave={() => setActive(null)}>
        {columns.map((c, i) => {
          const h = c.value === 0 ? 2 : Math.max(4, (c.value / max) * (height - 22));
          const on = active === i;
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setActive(i)}
            >
              {on && (
                <span className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-sm border border-line-strong bg-surface-3 px-1.5 py-0.5 text-[11px] text-fg shadow-pop" style={{ bottom: h + 4 }}>
                  {c.display}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-7 rounded-t-[4px] transition-colors duration-150",
                  on || (highlightLast && i === columns.length - 1) ? "bg-accent" : "bg-white/[0.16]",
                )}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5">
        {columns.map((c, i) => (
          <span key={i} className="flex-1 text-center text-[11px] text-fg-3">
            {c.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {columns.map((c, i) => (
            <tr key={i}>
              <th scope="row">{c.label}</th>
              <td>{c.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
