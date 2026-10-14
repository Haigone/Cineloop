import Link from "next/link";
import { CalendarClock, ListOrdered } from "lucide-react";
import type { UpcomingNight } from "@/server/services/watch-party";
import { joinNames } from "@/domain/shared-watch";
import { nightDate } from "@/lib/dates";
import { KeyArt } from "@/components/media/key-art";

/** A night together not started yet: set for another day, or waiting for the ones before it to end. */
export function UpcomingNightCard({ night }: { night: UpcomingNight }) {
  const { party, title, names } = night;
  const scheduled = party.status === "scheduled" && party.scheduledFor;
  const Icon = scheduled ? CalendarClock : ListOrdered;
  return (
    <Link
      href="/watch-party"
      className="flex items-center gap-3 rounded-lg border border-dashed border-violet/55 bg-violet/[0.04] p-2 pr-3 transition-colors hover:border-violet/80 hover:bg-violet/[0.09]"
    >
      <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <KeyArt title={title} variant="backdrop" className="absolute inset-0" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{title.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-violet">
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {scheduled ? nightDate(party.scheduledFor!) : "In coda: parte quando finite quella in corso"}
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-3">{names.length ? `Con ${joinNames(names)}` : "Da solo"}</span>
      </span>
    </Link>
  );
}
