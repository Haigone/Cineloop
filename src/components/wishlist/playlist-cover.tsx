import { Users } from "lucide-react";
import type { Title } from "@/domain/types";
import { cn } from "@/lib/cn";
import { KeyArt } from "@/components/media/key-art";

/**
 * A playlist's cover: up to four posters in a square. A collaborative playlist wears a small
 * round badge in the corner, so it stands out from the ones only its owner edits.
 */
export function PlaylistCover({ titles, collaborative, className }: { titles: Title[]; collaborative: boolean; className?: string }) {
  const shown = titles.slice(0, 4);
  return (
    <div className={cn("relative size-16 shrink-0", className)}>
      <div aria-hidden className="grid size-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {Array.from({ length: shown.length === 1 ? 1 : 4 }, (_, i) => {
          const t = shown[i];
          return t ? (
            <KeyArt key={t.id} title={t} variant="poster" className={cn("size-full", shown.length === 1 && "col-span-2 row-span-2")} />
          ) : (
            <div key={i} className="bg-surface-2" />
          );
        })}
      </div>
      {collaborative && (
        <span
          role="img"
          aria-label="Playlist collaborativa"
          title="Playlist collaborativa: gli amici possono aggiungere titoli"
          className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full border-2 border-surface bg-accent-fill text-white"
        >
          <Users aria-hidden className="size-3" />
        </span>
      )}
    </div>
  );
}
