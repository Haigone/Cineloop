import { CalendarClock } from "lucide-react";
import type { ReleaseCard } from "@/server/services/explore";
import { cn } from "@/lib/cn";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";

/** Countdown on the poster; within a week it turns to the accent colour. */
export function ReleaseBadge({ label, soon }: { label: string; soon: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-md",
        soon ? "bg-accent-fill text-white" : "bg-black/65 text-fg",
      )}
    >
      <CalendarClock aria-hidden className="size-3" />
      {label}
    </span>
  );
}

const SOON = new Set(["Oggi", "Domani"]);

function isSoon(badge: string) {
  if (SOON.has(badge)) return true;
  const days = /^Tra (\d+) giorni$/.exec(badge);
  return days ? Number(days[1]) <= 7 : false;
}

/** A row of posters for things coming out, each with its countdown and date. */
export function ReleaseRail({ label, releases, wishlistIds }: { label: string; releases: ReleaseCard[]; wishlistIds: Set<string> }) {
  return (
    <Rail label={label}>
      {releases.map((r) => (
        <TitleCard
          key={r.title.id}
          title={r.title}
          wishlisted={wishlistIds.has(r.title.id)}
          badge={<ReleaseBadge label={r.badge} soon={isSoon(r.badge)} />}
          meta={r.meta}
        />
      ))}
    </Rail>
  );
}
