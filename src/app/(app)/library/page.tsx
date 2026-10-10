import type { Metadata } from "next";
import { Suspense } from "react";
import type { LibrarySort, LibraryStatusFilter, LibraryTypeFilter } from "@/domain/library";
import { getLibraryView } from "@/server/services/library";
import { LibraryBrowser } from "@/components/library/library-browser";
import { SectionHeader } from "@/components/ui/section-header";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { AwaitingList } from "@/components/library/awaiting-list";
import { NewSeasonsRail } from "@/components/library/new-seasons-rail";

export const metadata: Metadata = { title: "La mia libreria" };

const TYPES: LibraryTypeFilter[] = ["all", "movie", "series", "anime"];
const STATUSES: LibraryStatusFilter[] = ["all", "completed", "watching"];
const SORTS: LibrarySort[] = ["recent", "rating", "title", "added"];

function pick<T extends string>(value: string | string[] | undefined, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <>
      <SectionHeader as="h1" title="La mia libreria" description="Tutto quello che hai visto e che stai seguendo. Quello che vuoi vedere è nella wishlist." />
      <Suspense fallback={<GridSkeleton label="Caricamento della libreria" />}>
        <LibraryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LibraryContent({ searchParams }: { searchParams: PageProps<"/library">["searchParams"] }) {
  const [params, view] = await Promise.all([searchParams, getLibraryView()]);
  return (
    <>
      {view.newSeasons.length > 0 && (
        <section aria-labelledby="library-new-seasons" className="mb-10">
          <SectionHeader id="library-new-seasons" title="Novità" description="Serie che avevi finito e che hanno una stagione nuova. Aprile e scegli “A che punto sei?” quando ricominci." />
          <NewSeasonsRail items={view.newSeasons} wishlistIds={new Set(view.wishlistIds)} />
        </section>
      )}
      {view.awaiting.length > 0 && (
        <section aria-labelledby="library-awaiting" className="mb-10">
          <SectionHeader id="library-awaiting" title="In attesa" description="Serie che hai finito e che stanno per tornare: quanto manca alla nuova stagione o al prossimo episodio." />
          <AwaitingList items={view.awaiting} />
        </section>
      )}
      <LibraryBrowser
      items={view.items}
      wishlistIds={view.wishlistIds}
      initial={{
        type: pick(params.type, TYPES, "all"),
        status: pick(params.filter, STATUSES, "all"),
        sort: pick(params.sort, SORTS, "recent"),
      }}
    />
    </>
  );
}
