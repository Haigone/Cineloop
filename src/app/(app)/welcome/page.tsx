import type { Metadata } from "next";
import { Suspense } from "react";
import { ONBOARDING_POOL, ONBOARDING_TARGET } from "@/domain/onboarding";
import type { Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { SectionHeader } from "@/components/ui/section-header";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { SeriesPicker } from "@/components/onboarding/series-picker";

export const metadata: Metadata = { title: "Benvenuto" };

/** First access, right after registering: pick the Netflix series you have seen and liked. */
export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-[960px]">
      <Suspense fallback={<GridSkeleton label="Caricamento delle serie" count={12} />}>
        <Welcome />
      </Suspense>
    </div>
  );
}

async function Welcome() {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const ids = ONBOARDING_POOL.flatMap((g) => g.ids);
  const [titles, library] = await Promise.all([repo.getTitlesByIds(ids), repo.listLibrary(viewer.id)]);
  const byId = new Map(titles.map((t) => [t.id, t]));
  const groups = ONBOARDING_POOL.map((g) => ({
    category: g.category,
    titles: g.ids.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t)),
  })).filter((g) => g.titles.length > 0);
  const liked = library.filter((e) => ids.includes(e.titleId) && (e.rating ?? 0) >= 7).map((e) => e.titleId);

  return (
    <>
      <SectionHeader
        as="h1"
        title={`Benvenuto, ${viewer.displayName.split(" ")[0]}. Quali di queste serie hai visto e ti sono piaciute?`}
        description="Sono tra le serie Netflix più votate, divise per genere. Tocca quelle che ti sono piaciute: da lì partono i tuoi consigli e finiscono in libreria come viste."
        className="mb-8"
      />
      <SeriesPicker groups={groups} target={ONBOARDING_TARGET} initial={liked} />
    </>
  );
}
