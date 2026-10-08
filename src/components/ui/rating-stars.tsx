import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Converts the stored 1–10 half-star value to a human label, e.g. "4,5 su 5". */
export function ratingLabel(value: number | null): string {
  if (value == null) return "Nessun voto";
  return `${(value / 2).toLocaleString("it-IT")} su 5`;
}

export function StarGlyph({ fill, size }: { fill: 0 | 0.5 | 1; size: string }) {
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

