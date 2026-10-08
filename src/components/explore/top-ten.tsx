import type { ReactNode } from "react";
import type { Title } from "@/domain/types";
import { TitleCard } from "@/components/media/title-card";
import { Rail } from "@/components/media/rail";

/** The week's chart: big outlined rank numbers set against each poster. */
export function TopTen({
  titles,
  wishlistIds,
  label,
  notes,
}: {
  titles: Title[];
  wishlistIds: ReadonlySet<string>;
  label: string;
  /** Optional line under each title instead of type and year (e.g. "3 persone"). */
  notes?: (ReactNode | null)[];
}) {
  return (
    <Rail label={label}>
      {titles.map((title, i) => (
        <div key={title.id} className="relative shrink-0 pl-11 sm:pl-14">
          {/* Sits on the poster's bottom edge, behind it; the caption below stays clear. */}
          <span
            aria-hidden
            className="absolute bottom-[46px] left-0 text-[92px] leading-[0.74] font-bold tracking-[-0.08em] text-bg tabular [-webkit-text-stroke:2px_rgb(255_255_255/0.32)] [paint-order:stroke_fill] sm:text-[112px]"
          >
            {i + 1}
          </span>
          <TitleCard title={title} wishlisted={wishlistIds.has(title.id)} className="relative" meta={notes?.[i] ?? undefined} />
          <span className="sr-only">{i + 1}° posto</span>
        </div>
      ))}
    </Rail>
  );
}
