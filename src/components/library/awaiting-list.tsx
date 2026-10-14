import Link from "next/link";
import type { Title } from "@/domain/types";
import type { AwaitedRelease } from "@/server/services/awaited";
import { KeyArt } from "@/components/media/key-art";
import { ReleaseTimer } from "@/components/media/release-timer";

/** Titles waiting on a release (by default, finished series waiting on a new season), each with the time left. */
export function AwaitingList({ items, label = "Serie in attesa di nuove stagioni" }: { items: { title: Title; release: AwaitedRelease }[]; label?: string }) {
  return (
    <ul aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ title, release }) => (
        <li key={title.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
          <Link href={`/title/${title.id}`} className="shrink-0 rounded-md">
            <KeyArt title={title} variant="poster" className="aspect-[2/3] w-11 rounded-md border border-line" />
            <span className="sr-only">{title.title}</span>
          </Link>
          <div className="min-w-0">
            <Link href={`/title/${title.id}`} className="block truncate rounded-sm text-sm font-medium hover:underline hover:underline-offset-4">
              {title.title}
            </Link>
            <ReleaseTimer className="mt-1.5" date={release.date} season={release.season} episode={release.episode} />
          </div>
        </li>
      ))}
    </ul>
  );
}
