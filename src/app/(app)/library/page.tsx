import type { Metadata } from "next";
import { Suspense } from "react";
import type {
  LibrarySort,
  LibraryStatusFilter,
  LibraryTypeFilter,
} from "@/domain/library";
import Link from "next/link";
import { PROVISIONAL_MODE, PROVISIONAL_RESET_DATE } from "@/config/provisional";
import { getLibraryView } from "@/server/services/library";
import { LibraryBrowser } from "@/components/library/library-browser";
import { SectionHeader } from "@/components/ui/section-header";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { newSeasonsLabel } from "@/server/services/new-seasons";
import { PersonalCollectionLibrary } from "@/components/collections/personal-collection-library";

export const metadata: Metadata = { title: "La mia libreria" };

const TYPES: LibraryTypeFilter[] = ["all", "movie", "series", "anime"];
const STATUSES: LibraryStatusFilter[] = ["all", "completed", "watching"];
const SORTS: LibrarySort[] = ["recent", "rating", "title", "added"];

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  if (PROVISIONAL_MODE) {
    return (
      <>
        <SectionHeader
          as="h1"
          title="La mia libreria"
          description={`Sospesa fino all'${PROVISIONAL_RESET_DATE}: il sito è in modalità provvisoria.`}
        />
        <p className="max-w-prose text-sm text-fg-2">
          Per un problema temporaneo del database lo storico di tutti non è disponibile, quindi la libreria è spenta. Non è andato perso nulla: l&apos;{PROVISIONAL_RESET_DATE} lo storico torna com&apos;era. Nel frattempo usa la{" "}
          <Link href="/wishlist" className="font-medium text-fg underline-offset-4 hover:underline">wishlist</Link>, la{" "}
          <Link href="/home" className="font-medium text-fg underline-offset-4 hover:underline">Home</Link> e{" "}
          <Link href="/explore" className="font-medium text-fg underline-offset-4 hover:underline">Esplora</Link>.
        </p>
      </>
    );
  }
  return (
    <>
      <SectionHeader
        as="h1"
        title="La mia libreria"
        description="Tutto quello che hai visto e che stai seguendo. Quello che vuoi vedere è nella wishlist."
      />
      <Suspense fallback={<GridSkeleton label="Caricamento di saghe e collezioni personali" />}>
        <PersonalCollectionLibrary />
      </Suspense>
      <Suspense fallback={<GridSkeleton label="Caricamento della libreria" />}>
        <LibraryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LibraryContent({
  searchParams,
}: {
  searchParams: PageProps<"/library">["searchParams"];
}) {
  const [params, view] = await Promise.all([searchParams, getLibraryView()]);
  return (
    <>
      <LibraryBrowser
        items={view.items}
        wishlistIds={view.wishlistIds}
        extras={view.extras.then((x) => ({
          newSeasons: x.newSeasons.map((i) => ({ title: i.title, label: newSeasonsLabel(i) })),
          awaiting: x.awaiting,
        }))}
        initial={{
          type: pick(params.type, TYPES, "all"),
          status: pick(params.filter, STATUSES, "all"),
          sort: pick(params.sort, SORTS, "recent"),
        }}
      />
    </>
  );
}
