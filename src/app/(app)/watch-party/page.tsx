import type { Metadata } from "next";
import { Suspense } from "react";
import { getWatchPartyView } from "@/server/services/watch-party";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { NightWizard } from "@/components/watch-party/night-wizard";
import { WatchPartyInvitations } from "@/components/watch-party/watch-party-invitations";

export const metadata: Metadata = { title: "Serate insieme" };

export default function WatchPartyPage({ searchParams }: PageProps<"/watch-party">) {
  return (
    <>
      <SectionHeader as="h1" title="Serate insieme" description="Un passo alla volta: chi c'è, come scegliete il titolo e quando lo guardate." />
      <Suspense
        fallback={
          <LoadingRegion label="Preparazione della serata" className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
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
  return (
    <>
      <WatchPartyInvitations invitations={view.invitations} />
      <NightWizard view={view} preselected={preselected} />
    </>
  );
}
