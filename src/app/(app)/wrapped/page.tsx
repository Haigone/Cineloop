import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getWrappedView } from "@/server/services/wrapped";
import { cn } from "@/lib/cn";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { RefreshWrapped } from "@/components/wrapped/refresh-wrapped";
import { WrappedCard } from "@/components/wrapped/wrapped-card";

export const metadata: Metadata = { title: "Il tuo Wrapped" };

export default function WrappedPage({ searchParams }: PageProps<"/wrapped">) {
  return (
    <>
      <SectionHeader as="h1" title="Il tuo Wrapped" description="Il tuo anno di visione, dalle ore che CineLoop ha segnato in libreria." />
      <Suspense fallback={<LoadingRegion label="Calcolo del Wrapped" className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></LoadingRegion>}>
        <WrappedContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function WrappedContent({ searchParams }: { searchParams: PageProps<"/wrapped">["searchParams"] }) {
  const { anno } = await searchParams;
  const asked = typeof anno === "string" ? Number(anno) : undefined;
  const { years, wrapped, source } = await getWrappedView(asked);
  if (!wrapped) {
    return (
      <p className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-6 text-sm text-fg-2">
        Non c&apos;è ancora nessuna visione in libreria. Guarda qualcosa con l&apos;estensione, o importa lo storico di Netflix dal suo pannello, e il tuo Wrapped comparirà qui.
      </p>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {years.length > 1 && (
        <nav aria-label="Anno" className="flex gap-2">
          {years.map((y) => (
            <Link key={y} href={`/wrapped?anno=${y}`} aria-current={y === wrapped.year ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", y === wrapped.year ? "border-accent text-accent" : "border-line text-fg-2")}>
              {y}
            </Link>
          ))}
        </nav>
      )}
      <WrappedCard wrapped={wrapped} />
      {source && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-xs text-fg-3">
          <p>
            Calcolato su {source.plays.toLocaleString("it-IT")} visioni del {wrapped.year}, di cui {source.fromNetflix.toLocaleString("it-IT")} importate da Netflix. L&apos;ultima è del{" "}
            {new Date(source.last).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
          </p>
          <RefreshWrapped />
        </div>
      )}
    </div>
  );
}
