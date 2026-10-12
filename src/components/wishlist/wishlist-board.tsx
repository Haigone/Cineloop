"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical, Heart, ListPlus, Plus, SearchX } from "lucide-react";
import type { Genre, MediaType } from "@/domain/types";
import type { PlaylistView, WishlistRow } from "@/server/services/wishlist";
import { setInPlaylist } from "@/server/actions/playlists";
import { reorderWishlist, setWishlisted } from "@/server/actions/library";
import { cn } from "@/lib/cn";
import { firstName, MEDIA_TYPE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";
import { ReleaseTimer } from "@/components/media/release-timer";
import { AddTitleDialog } from "./add-title-dialog";
import { PlaylistsPanel } from "./playlists-panel";

/** The viewer's playlists, for the "Playlist" menu on each row. */
const PlaylistsContext = createContext<PlaylistView[]>([]);

type TypeFilter = "all" | MediaType;
type Sort = "rank" | "added" | "rating";

const SORT_LABEL: Record<Sort, string> = { rank: "La mia classifica", added: "Data aggiunta", rating: "Voto community" };

/**
 * The wishlist is a ranked queue. In "La mia classifica" order it can be
 * reordered by dragging the handle or with the up/down buttons (keyboard).
 */
export function WishlistBoard({ initialRows, playlists }: { initialRows: WishlistRow[]; playlists: PlaylistView[] }) {
  const [tab, setTab] = useState<"list" | "playlists">("list");
  const [rows, setRows] = useState(initialRows);
  // Server data wins whenever it changes (e.g. after adding from the dialog).
  const [source, setSource] = useState(initialRows);
  if (source !== initialRows) {
    setSource(initialRows);
    setRows(initialRows);
  }
  const [type, setType] = useState<TypeFilter>("all");
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [sort, setSort] = useState<Sort>("rank");
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const genres = useMemo(() => [...new Set(rows.flatMap((r) => r.title.genres))].sort((a, b) => a.localeCompare(b, "it")), [rows]);
  const filtered = rows.filter((r) => (type === "all" || r.title.type === type) && (genre === "all" || r.title.genres.includes(genre)));
  const shown =
    sort === "rank"
      ? filtered
      : [...filtered].sort((a, b) =>
          sort === "added"
            ? Date.parse(b.item.addedAt) - Date.parse(a.item.addedAt)
            : (b.title.communityRating ?? 0) - (a.title.communityRating ?? 0),
        );
  const canReorder = sort === "rank" && type === "all" && genre === "all";

  function persistOrder(next: WishlistRow[]) {
    startTransition(async () => {
      const res = await reorderWishlist(next.map((r) => r.title.id));
      if (!res.ok) toast.show(res.error, { tone: "error" });
    });
  }

  function moveToPosition(titleId: string, requestedPosition: number) {
    if (!Number.isInteger(requestedPosition) || requestedPosition < 1 || requestedPosition > rows.length) {
      toast.show(`Inserisci una posizione da 1 a ${rows.length}.`, { tone: "error" });
      return;
    }
    const from = rows.findIndex((r) => r.title.id === titleId);
    const to = requestedPosition - 1;
    if (from < 0 || from === to) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    setRows(next);
    persistOrder(next);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
    persistOrder(next);
    // Keep focus on the same control after the row moves.
    requestAnimationFrame(() =>
      document.getElementById(`move-${delta < 0 ? "up" : "down"}-${next[target]!.title.id}`)?.focus(),
    );
  }

  function remove(row: WishlistRow) {
    const index = rows.indexOf(row);
    setRows((xs) => xs.filter((x) => x !== row));
    startTransition(async () => {
      const res = await setWishlisted(row.title.id, false);
      if (!res.ok) {
        toast.show(res.error, { tone: "error" });
        setRows((xs) => insertAt(xs, index, row));
        return;
      }
      toast.show(`${row.title.title} rimosso dalla wishlist`, {
        action: {
          label: "Annulla",
          onClick: () =>
            startTransition(async () => {
              setRows((xs) => insertAt(xs, index, row));
              await setWishlisted(row.title.id, true);
              const restored = insertAt(
                rows.filter((x) => x !== row),
                index,
                row,
              );
              await reorderWishlist(restored.map((r) => r.title.id));
            }),
        },
      });
    });
  }

  const addButton = (
    <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setAdding(true)}>
      Aggiungi titolo
    </Button>
  );

  return (
    <PlaylistsContext.Provider value={playlists}>
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] md:text-[28px]">Wishlist</h1>
          <p className="mt-1 text-sm text-fg-2">
            {rows.length === 1 ? "1 titolo" : `${rows.length} titoli`} in coda. In cima quello che vuoi vedere per primo.
          </p>
        </div>
        {addButton}
      </div>

      <Segmented
        label="Sezione"
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: "Wishlist", count: rows.length },
          { value: "playlists", label: "Playlist", count: playlists.length },
        ]}
      />

      {tab === "playlists" ? (
        <PlaylistsPanel playlists={playlists} wishlist={rows} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title="La tua prossima ossessione potrebbe iniziare qui."
          description="Salva i titoli che vuoi vedere: li ritroverai qui e nelle proposte per la serata."
          action={addButton}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              label="Tipo"
              value={type}
              onChange={setType}
              options={[
                { value: "all", label: "Tutti" },
                { value: "movie", label: "Film" },
                { value: "series", label: "Serie" },
                { value: "anime", label: "Anime" },
              ]}
            />
            <div className="flex flex-wrap gap-4">
              <Select label="Genere" value={genre} onChange={(e) => setGenre(e.target.value as Genre | "all")}>
                <option value="all">Tutti</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select label="Ordina per" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<SearchX />}
              title="Nessun titolo con questi filtri."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setType("all");
                    setGenre("all");
                  }}
                >
                  Mostra tutto
                </Button>
              }
            />
          ) : canReorder ? (
            <Reorder.Group
              axis="y"
              values={rows}
              onReorder={setRows}
              className="mt-2 flex flex-col"
              aria-label="Wishlist, in ordine di priorità"
            >
              {rows.map((row, i) => (
                <DraggableRow
                  key={row.title.id}
                  row={row}
                  rank={i + 1}
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                  onMove={(d) => move(i, d)}
                  onMoveToPosition={(position) => moveToPosition(row.title.id, position)}
                  onRemove={() => remove(row)}
                  onDragEnd={() => persistOrder(rows)}
                />
              ))}
            </Reorder.Group>
          ) : (
            <ul className="mt-2 flex flex-col">
              <AnimatePresence initial={false}>
                {shown.map((row) => (
                  <motion.li key={row.title.id} layout exit={{ opacity: 0 }}>
                    <RowBody row={row} onRemove={() => remove(row)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {!canReorder && sort !== "rank" && shown.length > 0 && (
            <p className="mt-4 text-xs text-fg-3">Per riordinare la classifica scegli “La mia classifica” senza filtri.</p>
          )}
        </>
      )}

      <AddTitleDialog open={adding} onClose={() => setAdding(false)} existingIds={new Set(rows.map((r) => r.title.id))} />
    </div>
    </PlaylistsContext.Provider>
  );
}

function DraggableRow({
  row,
  rank,
  isFirst,
  isLast,
  onMove,
  onMoveToPosition,
  onRemove,
  onDragEnd,
}: {
  row: WishlistRow;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onMoveToPosition: (position: number) => void;
  onRemove: () => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative bg-bg"
      whileDrag={{ scale: 1.01, boxShadow: "0 24px 48px -16px rgb(0 0 0 / 0.8)", zIndex: 10 }}
    >
      <RowBody
        row={row}
        onRemove={onRemove}
        leading={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onPointerDown={(e) => controls.start(e)}
              className="hidden cursor-grab touch-none rounded-sm p-1 text-fg-3 hover:text-fg active:cursor-grabbing md:block"
            >
              <GripVertical className="size-4" />
            </button>
            <PositionEditor rank={rank} title={row.title.title} onConfirm={onMoveToPosition} />
          </div>
        }
        trailing={
          <div className="flex flex-col">
            <IconButton
              id={`move-up-${row.title.id}`}
              size="sm"
              tooltip={false}
              label={`Sposta ${row.title.title} su`}
              icon={<ArrowUp aria-hidden className="size-3.5" />}
              disabled={isFirst}
              onClick={() => onMove(-1)}
              className="size-7"
            />
            <IconButton
              id={`move-down-${row.title.id}`}
              size="sm"
              tooltip={false}
              label={`Sposta ${row.title.title} giù`}
              icon={<ArrowDown aria-hidden className="size-3.5" />}
              disabled={isLast}
              onClick={() => onMove(1)}
              className="size-7"
            />
          </div>
        }
      />
    </Reorder.Item>
  );
}

function PositionEditor({ rank, title, onConfirm }: { rank: number; title: string; onConfirm: (position: number) => void }) {
  const [value, setValue] = useState(String(rank));
  useEffect(() => setValue(String(rank)), [rank]);
  return (
    <input
      aria-label={`Posizione di ${title}`}
      title="Modifica la posizione e premi Invio"
      type="number"
      min={1}
      max={500}
      step={1}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const position = Number(value);
          if (!Number.isInteger(position) || position < 1 || position > 500) return;
          if (position !== rank && window.confirm(`Spostare “${title}” alla posizione ${position}?`)) onConfirm(position);
          else setValue(String(rank));
          (event.currentTarget as HTMLInputElement).blur();
        }
        if (event.key === "Escape") { setValue(String(rank)); (event.currentTarget as HTMLInputElement).blur(); }
      }}
      onBlur={() => setValue(String(rank))}
      className="w-10 rounded border border-line bg-bg px-1 py-1 text-center text-sm tabular text-fg-2 focus:border-accent focus:outline-none"
    />
  );
}

function RowBody({
  row,
  onRemove,
  leading,
  trailing,
}: {
  row: WishlistRow;
  onRemove: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const { title } = row;
  const social = row.suggestedBy
    ? `Consigliato da ${firstName(row.suggestedBy.displayName)}`
    : row.friendsWant.length
      ? `Lo vuole vedere anche ${row.friendsWant.map((f) => firstName(f.displayName)).slice(0, 2).join(" e ")}${row.friendsWant.length > 2 ? ` e altri ${row.friendsWant.length - 2}` : ""}`
      : null;

  return (
    <div className="flex items-center gap-3 border-b border-line py-3 sm:gap-4">
      {leading}
      <Link href={`/title/${title.id}`} className="shrink-0 rounded-md">
        <KeyArt title={title} variant="poster" className="aspect-[2/3] w-12 rounded-md border border-line sm:w-14" />
        <span className="sr-only">{title.title}</span>
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/title/${title.id}`} className="block truncate rounded-sm text-[15px] font-medium text-fg hover:underline hover:underline-offset-4">
          {title.title}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-fg-2">
          {MEDIA_TYPE_LABEL[title.type]} · {title.year} · {title.genres.slice(0, 2).join(", ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {title.providers.slice(0, 2).map((p) => (
            <ProviderBadge key={p} id={p} quiet />
          ))}
          {social && <span className={cn("text-xs", row.suggestedBy ? "text-violet" : "text-fg-3")}>{social}</span>}
        </div>
        {row.release && <ReleaseTimer className="mt-1.5" date={row.release.date} season={row.release.season} episode={row.release.episode} />}
      </div>
      {title.communityRating != null && (
        <span className="hidden w-12 text-right text-sm tabular text-fg-2 sm:block" aria-label={`Voto community ${title.communityRating} su 10`}>
          {title.communityRating.toLocaleString("it-IT")}
        </span>
      )}
      <PlaylistMenu titleId={title.id} titleName={title.title} />
      <RemoveHeart titleName={title.title} onRemove={onRemove} />
      {trailing}
    </div>
  );
}

/** "Playlist": puts the title in, or takes it out of, any of the viewer's playlists. */
function PlaylistMenu({ titleId, titleName }: { titleId: string; titleName: string }) {
  const playlists = useContext(PlaylistsContext);
  const [, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Popover
      label={`Playlist di ${titleName}`}
      className="w-64 p-2"
      trigger={(props) => (
        <IconButton {...props} size="sm" tooltip={false} label={`Playlist: ${titleName}`} icon={<ListPlus aria-hidden className="size-4" />} className="size-9" />
      )}
    >
      {() =>
        playlists.length === 0 ? (
          <p className="px-2 py-2 text-sm text-fg-2">Nessuna playlist. Creane una dalla scheda Playlist.</p>
        ) : (
          <ul className="flex max-h-64 flex-col overflow-auto">
            {playlists.map(({ playlist }) => (
              <li key={playlist.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-fg hover:bg-white/[0.05]">
                  <input
                    type="checkbox"
                    checked={playlist.titleIds.includes(titleId)}
                    onChange={(e) =>
                      startTransition(async () => {
                        const res = await setInPlaylist(playlist.id, titleId, e.target.checked);
                        if (!res.ok) toast.show(res.error, { tone: "error" });
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )
      }
    </Popover>
  );
}

function RemoveHeart({ titleName, onRemove }: { titleName: string; onRemove: () => void }) {
  const [popping, setPopping] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Rimuovi ${titleName} dalla wishlist`}
      onClick={() => {
        setPopping(true);
        window.setTimeout(onRemove, 260);
      }}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent-soft"
    >
      <motion.span
        animate={popping ? { scale: [1, 1.35, 0.6], opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        className="inline-flex"
      >
        <Heart aria-hidden className="size-[18px]" fill="currentColor" />
      </motion.span>
    </button>
  );
}

function insertAt<T>(xs: T[], index: number, item: T): T[] {
  const next = [...xs];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}
