"use client";

import { useId, useState } from "react";
import { Star } from "lucide-react";
import type { RatingValue } from "@/domain/types";
import { cn } from "@/lib/cn";

/** Converts the stored 1–10 half-star value to a human label, e.g. "4,5 su 5". */
export function ratingLabel(value: number | null): string {
  if (value == null) return "Nessun voto";
  return `${(value / 2).toLocaleString("it-IT")} su 5`;
}

function StarGlyph({ fill, size }: { fill: 0 | 0.5 | 1; size: string }) {
  return (
    <span className={cn("relative inline-block", size)} aria-hidden>
      <Star className={cn("absolute inset-0 text-white/15", size)} fill="currentColor" strokeWidth={0} />
      {fill > 0 && (
        <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 1 ? "100%" : "50%" }}>
          <Star className={cn("text-accent", size)} fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

/** Read-only stars. */
export function RatingStars({ value, size = "sm", className }: { value: number | null; size?: "xs" | "sm" | "md"; className?: string }) {
  const s = size === "xs" ? "size-3" : size === "sm" ? "size-3.5" : "size-5";
  return (
    <span role="img" aria-label={ratingLabel(value)} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const v = value ?? 0;
        const fill = v >= i * 2 ? 1 : v === i * 2 - 1 ? 0.5 : 0;
        return <StarGlyph key={i} fill={fill} size={s} />;
      })}
    </span>
  );
}

interface RatingInputProps {
  value: RatingValue | null;
  onChange: (value: RatingValue | null) => void;
  label: string;
  disabled?: boolean;
}

/**
 * Half-star rating input built as a native radio group, so arrow keys,
 * focus and screen readers work without custom key handling.
 */
export function RatingInput({ value, onChange, label, disabled }: RatingInputProps) {
  const name = useId();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <fieldset className="inline-flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="relative inline-flex size-6">
            <StarGlyph fill={shown >= star * 2 ? 1 : shown === star * 2 - 1 ? 0.5 : 0} size="size-6" />
            {([star * 2 - 1, star * 2] as RatingValue[]).map((v, half) => (
              <label
                key={v}
                className={cn("absolute inset-y-0 w-1/2 cursor-pointer", half === 0 ? "left-0" : "right-0")}
                onMouseEnter={() => setHover(v)}
              >
                <input
                  type="radio"
                  name={name}
                  value={v}
                  checked={value === v}
                  onChange={() => onChange(v)}
                  onClick={() => value === v && onChange(null)}
                  className="peer sr-only"
                />
                <span className="sr-only">{ratingLabel(v)}</span>
                <span aria-hidden className="absolute inset-0 rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
              </label>
            ))}
          </span>
        ))}
        <span className="ml-2 min-w-[3ch] text-sm tabular text-fg-2" aria-hidden>
          {shown ? (shown / 2).toLocaleString("it-IT") : "–"}
        </span>
      </div>
    </fieldset>
  );
}
