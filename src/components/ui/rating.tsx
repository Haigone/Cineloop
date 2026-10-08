"use client";

import { useId, useState } from "react";
import type { RatingValue } from "@/domain/types";
import { cn } from "@/lib/cn";
import { StarGlyph, ratingLabel } from "./rating-stars";

export { RatingStars, ratingLabel } from "./rating-stars";

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
