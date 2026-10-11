import { CalendarClock } from "lucide-react";
import type { AwaitedRelease } from "@/server/services/awaited";
import { ReleaseTimer } from "@/components/media/release-timer";

/** Tells that a series being watched has an episode scheduled, and when. */
export function NewEpisodeNotice({ release }: { release: AwaitedRelease }) {
  return (
    <div role="note" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface/80 px-3.5 py-2.5 text-sm">
      <CalendarClock aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="font-medium text-fg">{release.date ? "Nuovo episodio in arrivo" : "Nuovi episodi in arrivo"}</span>
      <ReleaseTimer date={release.date} season={release.season} episode={release.episode} />
    </div>
  );
}
