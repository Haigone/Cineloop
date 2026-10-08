import Link from "next/link";
import type { ReactNode } from "react";
import type { Title } from "@/domain/types";
import { KeyArt } from "@/components/media/key-art";

/** Numbered because it is a ranking: position carries meaning. */
export function RankedList({ items, empty }: { items: { title: Title; right: ReactNode; sub?: string }[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-sm text-fg-2">{empty}</p>;
  return (
    <ol className="flex flex-col">
      {items.map(({ title, right, sub }, i) => (
        <li key={title.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
          <span className="w-5 shrink-0 text-right text-sm tabular text-fg-3">{i + 1}</span>
          <KeyArt title={title} variant="poster" className="aspect-[2/3] w-8 shrink-0 rounded-[4px]" />
          <span className="min-w-0 flex-1">
            <Link href={`/title/${title.id}`} className="block truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4">
              {title.title}
            </Link>
            {sub && <span className="block truncate text-xs text-fg-3">{sub}</span>}
          </span>
          <span className="shrink-0">{right}</span>
        </li>
      ))}
    </ol>
  );
}
