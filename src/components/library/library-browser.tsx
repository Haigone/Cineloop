"use client";

import { Suspense, use, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LibraryBig, SearchX } from "lucide-react";
import {
  countBy,
  filterLibrary,
  sortLibrary,
  STATUS_LABEL,
  type LibraryItem,
  type LibrarySort,
  type LibraryStatusFilter,
  type LibraryTypeFilter,
  type PersonalLibraryGroup,
} from "@/domain/library";
import { sectionOf, type Title } from "@/domain/types";
import type { AwaitedRelease } from "@/server/services/awaited";
import { EntryMenu } from "./entry-menu";
import { episodeLabel, percent } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RatingStars } from "@/components/ui/rating";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { AwaitingList } from "./awaiting-list";
import { NewSeasonsRail } from "./new-seasons-rail";
import { TitleCard } from "@/components/media/title-card";
import { PersonalCollectionCard } from "@/components/collections/personal-collection-card";

const TYPE_OPTIONS: { value: LibraryTypeFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "movie", label: "Film" },
  { value: "series", label: "Serie" },
  { value: "anime", label: "Anime" },
  { value: "saga", label: "Saghe" },
  { value: "collection", label: "Collezioni" },
];

const STATUS_OPTIONS: { value: LibraryStatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "completed", label: "Visti" },
  { value: "watching", label: "In corso" },
];

const SORT_LABEL: Record<LibrarySort, string> = {
  recent: "Visti di recente",
  rating: "Valutazione",
  title: "Titolo",
  added: "Data aggiunta",
};

interface Props {
  items: LibraryItem[];
  groups: PersonalLibraryGroup[];
  wishlistIds: string[];
  /** Finished series with a new season out, and series waiting on one; they follow the type chosen below. */
  extras: Promise<{ newSeasons: { title: Title; label: string }[]; awaiting: { title: Title; release: AwaitedRelease }[] }>;
  initial: {
    type: LibraryTypeFilter;
    status: LibraryStatusFilter;
    sort: LibrarySort;
  };
}

/** Filters live in the URL (replaceState), so a view can be bookmarked or shared. */
export function LibraryBrowser({
  items,
  groups,
  wishlistIds,
  extras,
  initial,
}: Props) {
  const [type, setType] = useState(initial.type);
  const [status, setStatus] = useState(initial.status);
  const [sort, setSort] = useState(initial.sort);
  const wishlist = useMemo(() => new Set(wishlistIds), [wishlistIds]);

  function sync(next: Partial<Props["initial"]>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) {
      const key = k === "status" ? "filter" : k;
      if (v === "all" || (k === "sort" && v === "recent")) params.delete(key);
      else params.set(key, v);
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }

  const byType = useMemo(
    () => filterLibrary(items, "all", status),
    [items, status],
  );
  const matchingGroups = groups.filter((group) => type === "all" || group.kind === type);
  const visibleGroups = matchingGroups.filter((group) => status === "all" || (status === "completed" ? group.completed > 0 : group.watching > 0));
  const typeCounts = countBy(byType, (i) => sectionOf(i.title));
  const statusCounts = countBy(filterLibrary(items, type, "all"), (i) => i.entry.status);
  const shown = useMemo(
    () => sortLibrary(filterLibrary(items, type, status), sort),
    [items, type, status, sort],
  );

  if (items.length === 0 && groups.length === 0) {
    return (
      <EmptyState
        icon={<LibraryBig />}
        title="Il tuo viaggio cinematografico inizia qui."
        description="Cerca un film, una serie o un anime e aggiungilo alla libreria: CineLoop terrà traccia di cosa hai visto e di cosa stai seguendo."
        action={<ButtonLink href="/wishlist">Esplora la wishlist</ButtonLink>}
      />
    );
  }

  return (
    <div>
      <Suspense fallback={null}>
        <Extras extras={extras} type={type} wishlist={wishlist} />
      </Suspense>
      <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Segmented
            label="Tipo"
            options={TYPE_OPTIONS.map((o) => ({
              ...o,
              count:
                o.value === "all" ? byType.length + groups.filter((group) => status === "all" || (status === "completed" ? group.completed > 0 : group.watching > 0)).length
                : o.value === "saga" || o.value === "collection"
                  ? groups.filter((group) => group.kind === o.value && (status === "all" || (status === "completed" ? group.completed > 0 : group.watching > 0))).length
                  : (typeCounts[o.value] ?? 0),
            }))}
            value={type}
            onChange={(v) => {
              setType(v);
              sync({ type: v });
            }}
          />
          <span
            aria-hidden
            className="hidden h-5 w-px bg-line-strong sm:block"
          />
          <Segmented
            label="Stato"
            options={STATUS_OPTIONS.map((o) => ({
              ...o,
              count:
                o.value === "all"
                  ? filterLibrary(items, type, "all").length + matchingGroups.length
                  : (statusCounts[o.value] ?? 0) + matchingGroups.filter((group) => o.value === "completed" ? group.completed > 0 : group.watching > 0).length,
            }))}
            value={status}
            onChange={(v) => {
              setStatus(v);
              sync({ status: v });
            }}
          />
        </div>
        <Select
          label="Ordina per"
          value={sort}
          onChange={(e) => {
            const v = e.target.value as LibrarySort;
            setSort(v);
            sync({ sort: v });
          }}
        >
          {(Object.keys(SORT_LABEL) as LibrarySort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.length + visibleGroups.length} elementi
      </p>

      {shown.length === 0 && visibleGroups.length === 0 ? (
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
                setStatus("all");
                sync({ type: "all", status: "all" });
              }}
            >
              Mostra tutto
            </Button>
          }
        />
      ) : (
        <motion.ul
          layout
          aria-label="Titoli in libreria"
          className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visibleGroups.map((group) => (
              <motion.li
                key={group.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="relative focus-within:z-20"
              >
                <PersonalCollectionCard group={group} />
              </motion.li>
            ))}
            {shown.map(({ entry, title }) => (
              <motion.li
                key={title.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                // An open menu stays above the cards after it.
                className="relative focus-within:z-20"
              >
                <div className="absolute top-2 right-2 z-10">
                  <EntryMenu title={title} entry={entry} />
                </div>
                <TitleCard
                  title={title}
                  className="w-full sm:w-full"
                  wishlisted={wishlist.has(title.id)}
                  showWishlist={false}
                  badge={
                    entry.status === "watching" ? (
                      <span className="rounded-sm bg-black/60 px-1.5 py-0.5 text-[11px] text-fg backdrop-blur-md">
                        In corso
                      </span>
                    ) : undefined
                  }
                  meta={<EntryMeta item={{ entry, title }} />}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}

function EntryMeta({ item: { entry } }: { item: LibraryItem }) {
  if (entry.status === "completed") {
    return entry.rating ? (
      <RatingStars value={entry.rating} size="xs" />
    ) : (
      <span>{STATUS_LABEL.completed}</span>
    );
  }
  if (entry.status === "watching" && entry.progress) {
    const ep = episodeLabel(entry.progress, "short");
    return (
      <span className="tabular">
        {ep
          ? `${ep} · ${percent(entry.progress.fraction)}`
          : percent(entry.progress.fraction)}
      </span>
    );
  }
  return <span>{STATUS_LABEL[entry.status]}</span>;
}

/** Novità and In attesa ask outside services: they appear when ready, the library does not wait for them. */
function Extras({ extras, type, wishlist }: { extras: Props["extras"]; type: LibraryTypeFilter; wishlist: ReadonlySet<string> }) {
  const { newSeasons, awaiting } = use(extras);
  const newShown = newSeasons.filter((n) => type === "all" || sectionOf(n.title) === type);
  const awaitingShown = awaiting.filter((x) => type === "all" || sectionOf(x.title) === type);
  return (
    <>
      {newShown.length > 0 && (
        <section aria-labelledby="library-new-seasons" className="mb-10">
          <SectionHeader
            id="library-new-seasons"
            title="Novità"
            description="Serie che avevi finito e che hanno una stagione nuova. Aprile e scegli “A che punto sei?” quando ricominci."
          />
          <NewSeasonsRail items={newShown} wishlistIds={wishlist} />
        </section>
      )}
      {awaitingShown.length > 0 && (
        <section aria-labelledby="library-awaiting" className="mb-10">
          <SectionHeader
            id="library-awaiting"
            title="In attesa"
            description="Serie e anime, finiti o che stai guardando, con una nuova stagione o un nuovo episodio in arrivo: quanto manca."
          />
          <AwaitingList items={awaitingShown} />
        </section>
      )}
    </>
  );
}
