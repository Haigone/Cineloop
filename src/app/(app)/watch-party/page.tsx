import type { Metadata } from "next";
import { Suspense } from "react";
import { getWatchPartyView } from "@/server/services/watch-party";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { WatchPartyPlanner } from "@/components/watch-party/watch-party-planner";

export const metadata: Metadata = { title: "Serate insieme" };

export default function WatchPartyPage({ searchParams }: PageProps<"/watch-party">) {
  return (
    <>
      <SectionHeader as="h1" title="Serate insieme" description="Scegli chi c'è, CineLoop trova cosa potete guardare tutti. La ruota decide il resto." />
      <Suspense
        fallback={
          <LoadingRegion label="Preparazione della serata" className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_460px]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
          </LoadingRegion>
        }
      >
        <PlannerContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PlannerContent({ searchParams }: { searchParams: PageProps<"/watch-party">["searchParams"] }) {
  const [params, view] = await Promise.all([searchParams, getWatchPartyView()]);
  const withParam = params.with;
  const preselected = (Array.isArray(withParam) ? withParam : withParam ? [withParam] : []).flatMap((s) => s.split(","));
  return <WatchPartyPlanner view={view} preselected={preselected} />;
}
