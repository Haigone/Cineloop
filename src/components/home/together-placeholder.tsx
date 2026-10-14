import Link from "next/link";
import type { SharedWatchView } from "@/server/services/shared-watch";
import { KeyArt } from "@/components/media/key-art";
import { TogetherLine } from "./together-line";

/** A "Serata insieme" with no place to resume yet (not started, or seen to the end): it opens the title. */
export function TogetherPlaceholder({ group }: { group: SharedWatchView }) {
  return (
    <Link
      href={`/title/${group.title.id}`}
      className="flex items-center gap-3 rounded-lg border border-violet/55 bg-violet/[0.07] p-2 pr-3 transition-colors hover:border-violet/80 hover:bg-violet/[0.11]"
    >
      <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <KeyArt title={group.title} variant="backdrop" className="absolute inset-0" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{group.title.title}</span>
        <span className="mt-0.5 block text-xs text-fg-3">Segnate dove siete arrivati: vale per tutti.</span>
        <TogetherLine group={group} />
      </span>
    </Link>
  );
}
