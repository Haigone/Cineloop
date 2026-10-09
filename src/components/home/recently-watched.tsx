import Link from "next/link";
import { Check, Play } from "lucide-react";
import type { RecentWatchItem } from "@/server/services/dashboard";
import { KeyArt } from "@/components/media/key-art";

function episodeLabel(item: RecentWatchItem) {
  if (item.title.type === "movie") return null;
  if (item.season !== null && item.episode !== null) return `S${item.season} · E${item.episode}`;
  return null;
}

export function RecentlyWatched({ items }: { items: RecentWatchItem[] }) {
  if (items.length === 0) return <p className="py-2 text-[13px] text-fg-3">I titoli che inizi o finisci appariranno qui.</p>;
  return <ul className="space-y-3">{items.map((item) => <li key={item.title.id}>
    <Link href={`/title/${item.title.id}`} className="group flex min-w-0 items-center gap-3 rounded-lg">
      <KeyArt title={item.title} variant="poster" className="h-[62px] w-[44px] shrink-0 rounded-md" sizes="44px" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg group-hover:text-accent">{item.title.title}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-3">
          {item.status === "completed" ? <Check aria-hidden className="size-3 text-emerald-400" /> : <Play aria-hidden className="size-3" />}
          {item.status === "completed" ? "Finito" : "In corso"}
          {episodeLabel(item) && <span>· {episodeLabel(item)}</span>}
        </span>
        {item.status === "watching" && item.fraction !== null && <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(1, item.fraction)) * 100}%` }} /></span>}
      </span>
    </Link>
  </li>)}</ul>;
}
