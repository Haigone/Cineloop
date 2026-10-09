import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { MediaType, Title } from "@/domain/types";
import { cn } from "@/lib/cn";
import { KeyArt } from "@/components/media/key-art";

export const HOME_SECTIONS: { type: MediaType; slug: string; label: string }[] = [
  { type: "movie", slug: "film", label: "Film" },
  { type: "series", slug: "serie", label: "Serie TV" },
  { type: "anime", slug: "anime", label: "Anime" },
];

export function sectionFromSlug(slug: unknown): MediaType | null {
  return HOME_SECTIONS.find((s) => s.slug === slug)?.type ?? null;
}

/** Film, Serie TV, Anime: Home shows one at a time and reopens on the last one chosen. */
export function HomeSectionTabs({ current, background }: { current: MediaType; background: Title | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <nav aria-label="Sezioni della Home">
        <ul className="flex gap-1 rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur-md">
          {HOME_SECTIONS.map((s) => {
            const active = s.type === current;
            return (
              <li key={s.type}>
                <Link
                  href={`/home?c=${s.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:px-5",
                    active ? "bg-fg text-bg" : "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link href="/settings#sfondi" className="inline-flex items-center gap-1.5 rounded-sm text-[13px] text-fg-3 transition-colors hover:text-fg">
        <ImageIcon aria-hidden className="size-3.5" />
        {background ? `Sfondo: ${background.title}` : "Scegli uno sfondo"}
      </Link>
    </div>
  );
}

/** The section's title art, faded behind the whole page. */
export function SectionBackdrop({ title }: { title: Title }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <KeyArt key={title.id} title={title} variant="backdrop" priority className="absolute inset-0 opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_9_13/0.25)_0%,rgb(8_9_13/0.75)_50%,#08090d_90%)]" />
    </div>
  );
}
