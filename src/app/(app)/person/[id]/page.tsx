import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UserRound } from "lucide-react";
import { getPersonView } from "@/server/services/person";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { CreditGrid, CreditMeta, SeenBadge } from "@/components/person/credit-grid";

export const metadata: Metadata = { title: "Filmografia" };

export default function PersonPage({ params }: PageProps<"/person/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <LoadingRegion label="Caricamento della persona">
            <Skeleton className="h-40 rounded-xl" />
          </LoadingRegion>
          <GridSkeleton label="Caricamento della filmografia" count={12} />
        </div>
      }
    >
      <PersonContent params={params} />
    </Suspense>
  );
}

function born(birthday: string | null, place: string | null): string | null {
  if (!birthday && !place) return null;
  const date = birthday ? new Date(`${birthday}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  return [date && `Nascita: ${date}`, place].filter(Boolean).join(" · ");
}

async function PersonContent({ params }: { params: PageProps<"/person/[id]">["params"] }) {
  const { id } = await params;
  const view = await getPersonView(decodeURIComponent(id));
  if (!view) notFound();
  const { person, best, movies, series } = view;
  const wishlist = new Set(view.wishlistIds);
  const seen = new Set(view.seenIds);
  const total = movies.length + series.length;
  const bornLine = born(person.birthday, person.placeOfBirth);

  return (
    <div className="space-y-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-[180px] w-[120px] shrink-0 overflow-hidden rounded-xl border border-line bg-white/[0.04]">
          {person.photoUrl ? (
            <Image src={person.photoUrl} alt={person.name} fill sizes="120px" className="object-cover" priority />
          ) : (
            <UserRound aria-hidden className="absolute inset-0 m-auto size-10 text-fg-3" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-[28px]">{person.name}</h1>
          <p className="mt-1 text-sm text-fg-2">
            {[person.role, total === 1 ? "1 titolo" : `${total} titoli`, seen.size > 0 && `${seen.size} nella tua libreria`].filter(Boolean).join(" · ")}
          </p>
          {bornLine && <p className="mt-1 text-sm text-fg-3">{bornLine}</p>}
          {person.biography && <p className="mt-3 line-clamp-5 max-w-[70ch] text-sm leading-relaxed text-fg-2">{person.biography}</p>}
        </div>
      </header>

      {best.length > 0 && (
        <section aria-labelledby="best-h">
          <SectionHeader as="h2" id="best-h" title="I più noti" />
          <Rail label={`I titoli più noti di ${person.name}`}>
            {best.map(({ title, role }, i) => (
              <TitleCard
                key={title.id}
                title={title}
                priority={i < 6}
                wishlisted={wishlist.has(title.id)}
                badge={seen.has(title.id) ? <SeenBadge /> : undefined}
                meta={<CreditMeta year={title.year} role={role} type={null} />}
              />
            ))}
          </Rail>
        </section>
      )}

      {movies.length > 0 && (
        <section aria-labelledby="movies-h">
          <SectionHeader as="h2" id="movies-h" title={`Film (${movies.length})`} description="Dal più recente." />
          <CreditGrid credits={movies} wishlistIds={wishlist} seenIds={seen} label={`Film con ${person.name}`} />
        </section>
      )}

      {series.length > 0 && (
        <section aria-labelledby="series-h">
          <SectionHeader as="h2" id="series-h" title={`Serie e anime (${series.length})`} description="Dalla più recente." />
          <CreditGrid credits={series} wishlistIds={wishlist} seenIds={seen} label={`Serie con ${person.name}`} showType />
        </section>
      )}

      {total === 0 && <p className="text-sm text-fg-2">Il catalogo non elenca ancora film o serie per {person.name}.</p>}
    </div>
  );
}
