"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ArrowRight, Globe, ListPlus, Lock, Trash2, X } from "lucide-react";
import type { PlaylistVisibility } from "@/domain/types";
import type { PlaylistView, WishlistRow } from "@/server/services/wishlist";
import type { CommunityPlaylistView } from "@/server/services/community";
import {
  createPlaylist,
  deletePlaylist,
  setInPlaylist,
  updatePlaylist,
} from "@/server/actions/playlists";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { PlaylistCover } from "./playlist-cover";
import { PlaylistSearch } from "./playlist-search";
import { TitleThumb } from "./title-thumb";
import { CommunityPlaylistCard } from "@/components/community/community-playlist-card";

const VISIBILITY: Record<PlaylistVisibility, { label: string; hint: string }> =
  {
    private: { label: "Solo io", hint: "La vedi solo tu." },
    friends: {
      label: "Amici",
      hint: "I tuoi amici possono caricarla in una serata insieme.",
    },
    collaborative: {
      label: "Collaborativa",
      hint: "I tuoi amici possono caricarla in una serata e aggiungere o togliere titoli.",
    },
  };

/** The viewer's playlists: create, rename, choose who can use them, add and remove titles. Then the ones saved from Community. */
export function PlaylistsPanel({
  playlists,
  saved,
  wishlist,
}: {
  playlists: PlaylistView[];
  saved: CommunityPlaylistView[];
  wishlist: WishlistRow[];
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<PlaylistVisibility>("private");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function create() {
    startTransition(async () => {
      const res = await createPlaylist({ name, visibility });
      if (res.ok) {
        setName("");
        setError(null);
        toast.show("Playlist creata");
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-fg">
          Nome della playlist
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Esempio: Natale, Halloween"
            aria-describedby={error ? "playlist-error" : undefined}
            className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-normal text-fg placeholder:text-fg-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Chi può usarla
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as PlaylistVisibility)
            }
            className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-normal text-fg"
          >
            {(Object.keys(VISIBILITY) as PlaylistVisibility[]).map((v) => (
              <option key={v} value={v}>
                {VISIBILITY[v].label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          loading={pending}
          disabled={name.trim().length === 0}
          icon={<ListPlus aria-hidden className="size-4" />}
        >
          Crea playlist
        </Button>
        {error && (
          <p
            id="playlist-error"
            role="alert"
            className="basis-full text-sm text-accent"
          >
            {error}
          </p>
        )}
      </form>

      {playlists.length === 0 ? (
        <EmptyState
          icon={<ListPlus />}
          title="Nessuna playlist per ora."
          description="Raggruppa i titoli per occasione, per esempio Natale o Halloween. Nelle serate insieme puoi caricare le tue e quelle che gli amici condividono."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {playlists.map((p) => (
            <PlaylistCard key={p.playlist.id} view={p} wishlist={wishlist} />
          ))}
        </ul>
      )}

      <section aria-labelledby="saved-playlists" className="flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="saved-playlists" className="text-[17px] font-semibold tracking-[-0.01em] text-fg">
              Salvate dalla Community
            </h2>
            <p className="mt-1 text-sm text-fg-2">
              Restano separate dalla tua wishlist: aggiungi i titoli che ti mancano quando vuoi, senza doppioni.
            </p>
          </div>
          <Link href="/community" className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[13px] text-fg-2 transition-colors hover:text-fg">
            Esplora la Community
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {saved.length === 0 ? (
          <p className="text-sm text-fg-2">Nessuna playlist salvata. Trovi quelle pubblicate dagli altri nella Community.</p>
        ) : (
          <ul className="grid items-start gap-4 lg:grid-cols-2">
            {saved.map((view) => (
              <CommunityPlaylistCard key={view.playlist.id} view={view} where="wishlist" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlaylistCard({
  view,
  wishlist,
}: {
  view: PlaylistView;
  wishlist: WishlistRow[];
}) {
  const { playlist, titles, owner } = view;
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(playlist.name);
  const [confirming, setConfirming] = useState(false);
  const [published, setPublished] = useOptimistic(playlist.publishedAt !== null);
  const toast = useToast();
  const inside = new Set(playlist.titleIds);
  const addable = wishlist.filter((r) => !inside.has(r.title.id));

  function act(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done?: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok)
        toast.show(res.error ?? "Qualcosa non ha funzionato.", {
          tone: "error",
        });
      else if (done) toast.show(done);
    });
  }

  const hintId = `pl-hint-${playlist.id}`;
  return (
    <li
      className="rounded-xl border border-line bg-surface p-4"
      aria-busy={pending}
    >
      {owner ? (
        <div className="flex items-center gap-3">
          <PlaylistCover titles={titles} collaborative />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">
              {playlist.name}
            </p>
            <p className="text-xs text-fg-3">
              Collaborativa di {owner.displayName}: puoi aggiungere e togliere
              titoli.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <PlaylistCover
            titles={titles}
            collaborative={playlist.visibility === "collaborative"}
            className="self-center"
          />
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[13px] font-medium text-fg">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== playlist.name)
                  act(() => updatePlaylist(playlist.id, { name }));
                else setName(playlist.name);
              }}
              maxLength={60}
              className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-normal text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
            Chi può usarla
            <select
              value={playlist.visibility}
              aria-describedby={hintId}
              onChange={(e) =>
                act(() =>
                  updatePlaylist(playlist.id, {
                    visibility: e.target.value as PlaylistVisibility,
                  }),
                )
              }
              className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-normal text-fg"
            >
              {(Object.keys(VISIBILITY) as PlaylistVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY[v].label}
                </option>
              ))}
            </select>
          </label>
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={pending}
                onClick={() => act(() => deletePlaylist(playlist.id))}
              >
                Elimina “{playlist.name}”
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Annulla
              </Button>
            </div>
          ) : (
            <IconButton
              label={`Elimina la playlist ${playlist.name}`}
              icon={<Trash2 aria-hidden className="size-4" />}
              onClick={() => setConfirming(true)}
            />
          )}
        </div>
      )}
      {!owner && (
        <p
          id={hintId}
          className="mt-2 flex items-center gap-1.5 text-xs text-fg-3"
        >
          {playlist.visibility === "private" ? (
            <Lock aria-hidden className="size-3" />
          ) : (
            <Globe aria-hidden className="size-3" />
          )}
          {VISIBILITY[playlist.visibility].hint}
        </p>
      )}
      {!owner && (
        <label className="mt-2 flex w-fit items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={published}
            disabled={pending}
            aria-describedby={`${hintId}-community`}
            onChange={(e) => {
              const next = e.target.checked;
              act(
                () => {
                  setPublished(next);
                  return updatePlaylist(playlist.id, { published: next });
                },
                next ? "Pubblicata nella Community" : "Tolta dalla Community",
              );
            }}
            className="size-4 accent-[var(--color-accent)]"
          />
          Pubblica nella Community
        </label>
      )}
      {!owner && (
        <p id={`${hintId}-community`} className="mt-1 text-xs text-fg-3">
          {published ? "Chiunque su CineLoop può vederla e salvarla, anche se sopra è “Solo io”. " : "Chiunque su CineLoop potrà vederla e salvarla. "}
          {published && (
            <Link href="/community" className="rounded-sm underline underline-offset-4 hover:text-fg">
              Vedila nella Community
            </Link>
          )}
        </p>
      )}

      {titles.length === 0 ? (
        <p className="mt-3 text-sm text-fg-2">
          Vuota. Cerca un titolo nel catalogo qui sotto, sceglilo dalla
          wishlist o usa il pulsante “Playlist” di ogni titolo.
        </p>
      ) : (
        <ul
          className="mt-3 divide-y divide-line"
          aria-label={`Titoli di ${playlist.name}`}
        >
          {titles.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <TitleThumb posterUrl={t.artwork.posterUrl} palette={t.artwork.palette} />
              <Link
                href={`/title/${t.id}`}
                className="min-w-0 flex-1 truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4"
              >
                {t.title}
                <span className="ml-2 text-xs text-fg-3">
                  {MEDIA_TYPE_LABEL[t.type]} · {t.year}
                </span>
              </Link>
              <IconButton
                size="sm"
                tooltip={false}
                label={`Togli ${t.title} da ${playlist.name}`}
                icon={<X aria-hidden className="size-3.5" />}
                onClick={() =>
                  act(() => setInPlaylist(playlist.id, t.id, false))
                }
              />
            </li>
          ))}
        </ul>
      )}

      <PlaylistSearch playlistId={playlist.id} playlistName={playlist.name} inside={inside} />

      {addable.length > 0 && (
        <label className="mt-3 flex flex-col gap-1 text-[13px] font-medium text-fg">
          Aggiungi dalla wishlist
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              act(() => setInPlaylist(playlist.id, e.target.value, true))
            }
            className="h-10 max-w-sm rounded-md border border-line-strong bg-surface-2 px-3 text-sm font-normal text-fg"
          >
            <option value="">Scegli un titolo</option>
            {addable.map((r) => (
              <option key={r.title.id} value={r.title.id}>
                {r.title.title} ({r.title.year})
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}
