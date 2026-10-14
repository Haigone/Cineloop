"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bookmark, BookmarkCheck, BookmarkX, HeartPlus } from "lucide-react";
import type { CommunityPlaylistView } from "@/server/services/community";
import { addPlaylistToWishlist, setPlaylistSaved } from "@/server/actions/playlists";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { PlaylistCover } from "@/components/wishlist/playlist-cover";
import { TitleThumb } from "@/components/wishlist/title-thumb";

function titlesLabel(n: number) {
  return n === 1 ? "1 titolo" : `${n} titoli`;
}

/**
 * A playlist published in Community: who made it, its titles, and two actions. "Salva" keeps it in
 * the viewer's wishlist area, apart from the wishlist itself; "Aggiungi alla wishlist" copies in
 * only the titles the wishlist does not have yet, so nothing ends up twice.
 */
export function CommunityPlaylistCard({ view, where }: { view: CommunityPlaylistView; where: "community" | "wishlist" }) {
  const { playlist, titles, owner, saves, saved, mine, missing } = view;
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save(next: boolean) {
    startTransition(async () => {
      const res = await setPlaylistSaved(playlist.id, next);
      if (!res.ok) toast.show(res.error, { tone: "error" });
      else toast.show(next ? "Salvata tra le tue playlist" : "Tolta dalle playlist salvate");
    });
  }

  function addMissing() {
    startTransition(async () => {
      const res = await addPlaylistToWishlist(playlist.id);
      if (!res.ok) toast.show(res.error, { tone: "error" });
      else toast.show(res.added ? `${titlesLabel(res.added)} in wishlist` : "Erano già tutti in wishlist");
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4" aria-busy={pending}>
      <div className="flex items-center gap-3">
        <PlaylistCover titles={titles} collaborative={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fg">{playlist.name}</p>
          <p className="truncate text-xs text-fg-3">
            {mine ? "Pubblicata da te" : owner ? `di ${owner.displayName}` : "di un utente CineLoop"} · {titlesLabel(titles.length)}
            {where === "community" && saves > 0 && ` · salvata ${saves === 1 ? "1 volta" : `${saves} volte`}`}
          </p>
        </div>
      </div>

      {titles.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer rounded-sm text-[13px] text-fg-2 hover:text-fg">Mostra i titoli</summary>
          <ul className="mt-2 divide-y divide-line" aria-label={`Titoli di ${playlist.name}`}>
            {titles.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <TitleThumb posterUrl={t.artwork.posterUrl} palette={t.artwork.palette} />
                <Link href={`/title/${t.id}`} className="min-w-0 flex-1 truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4">
                  {t.title}
                  <span className="ml-2 text-xs text-fg-3">
                    {MEDIA_TYPE_LABEL[t.type]} · {t.year}
                  </span>
                </Link>
                {!missing.includes(t.id) && <span className="shrink-0 text-xs text-fg-3">Già tuo</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={missing.length > 0 ? "primary" : "secondary"}
          disabled={pending || missing.length === 0}
          onClick={addMissing}
          icon={<HeartPlus aria-hidden className="size-4" />}
        >
          {missing.length > 0 ? `Aggiungi ${titlesLabel(missing.length)} alla wishlist` : "Già tutti in wishlist"}
        </Button>
        {!mine &&
          (saved ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-pressed={where === "community" ? true : undefined}
              onClick={() => save(false)}
              icon={where === "wishlist" ? <BookmarkX aria-hidden className="size-4" /> : <BookmarkCheck aria-hidden className="size-4" />}
            >
              {where === "wishlist" ? "Togli dalle salvate" : "Salvata"}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={pending} aria-pressed={false} onClick={() => save(true)} icon={<Bookmark aria-hidden className="size-4" />}>
              Salva
            </Button>
          ))}
      </div>
    </li>
  );
}
