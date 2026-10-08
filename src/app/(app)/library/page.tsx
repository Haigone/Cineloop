import type { Metadata } from "next";
import { Suspense } from "react";
import type { LibrarySort, LibraryStatusFilter, LibraryTypeFilter } from "@/domain/library";
import { getLibraryView } from "@/server/services/library";
import { LibraryBrowser } from "@/components/library/library-browser";
import { SectionHeader } from "@/components/ui/section-header";
import { GridSkeleton } from "@/components/media/grid-skeleton";

export const metadata: Metadata = { title: "La mia libreria" };

const TYPES: LibraryTypeFilter[] = ["all", "movie", "series", "anime"];
const STATUSES: LibraryStatusFilter[] = ["all", "completed", "watching", "planned"];
const SORTS: LibrarySort[] = ["recent", "rating", "title", "added"];

function pick<T extends string>(value: string | string[] | undefined, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <>
      <SectionHeader as="h1" title="La mia libreria" description="Tutto quello che hai visto, che stai seguendo e che hai in programma." />
      <Suspense fallback={<GridSkeleton label="Caricamento della libreria" />}>
        <LibraryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LibraryContent({ searchParams }: { searchParams: PageProps<"/library">["searchParams"] }) {
  const [params, view] = await Promise.all([searchParams, getLibraryView()]);
  return (
    <LibraryBrowser
      items={view.items}
      wishlistIds={view.wishlistIds}
      initial={{
        type: pick(params.type, TYPES, "all"),
        status: pick(params.filter, STATUSES, "all"),
        sort: pick(params.sort, SORTS, "recent"),
      }}
    />
  );
}
