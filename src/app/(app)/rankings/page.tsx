import type { Metadata } from "next";
import { Suspense } from "react";
import { Trophy, Users } from "lucide-react";
import { getRankingsView } from "@/server/services/profile";
import type { PublicUser } from "@/domain/types";
import { AvatarStack } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { RatingStars } from "@/components/ui/rating-stars";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { BarList } from "@/components/profile/bar-list";
import { ColumnChart } from "@/components/profile/column-chart";
import { RankedList } from "@/components/rankings/ranked-list";

export const metadata: Metadata = { title: "Classifiche" };

export default function RankingsPage() {
  return (
    <>
      <SectionHeader as="h1" title="Classifiche" description="I tuoi titoli migliori e cosa mette d'accordo i tuoi amici." />
      <Suspense
        fallback={
          <LoadingRegion label="Caricamento delle classifiche" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-96 rounded-xl" />
            ))}
          </LoadingRegion>
        }
      >
        <RankingsContent />
      </Suspense>
    </>
  );
}

const names = (users: PublicUser[]) => users.map((u) => u.displayName.split(" ")[0]).join(", ");
const avg = (v: number) => (v / 2).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function RankingsContent() {
  const { personal: p, social: s, friendCount } = await getRankingsView();
  const rated = p.distribution.reduce((a, b) => a + b, 0);

  if (rated === 0 && friendCount === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="Valuta i titoli che hai visto per costruire le tue classifiche."
        description="Ogni voto che dai finisce qui, ordinato per te."
        action={<ButtonLink href="/library">Vai alla libreria</ButtonLink>}
      />
    );
  }

  const personalLists = [
    { id: "movies", title: "Film", items: p.movies, empty: "Nessun film valutato." },
    { id: "series", title: "Serie", items: p.series, empty: "Nessuna serie valutata." },
    { id: "anime", title: "Anime", items: p.anime, empty: "Nessun anime valutato." },
  ];

  return (
    <Reveal className="space-y-12">
      <RevealItem as="section">
        <SectionHeader id="personal-h" title="I tuoi voti" description={`${rated} titoli valutati`} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {personalLists.map((l) => (
            <Panel key={l.id} title={l.title} titleId={`top-${l.id}`}>
              <RankedList empty={l.empty} items={l.items.map((t) => ({ title: t.title, right: <RatingStars value={t.value} size="xs" /> }))} />
            </Panel>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Generi più visti" titleId="genres-h">
            <BarList label="Quota di visioni per genere" items={p.genres.map((g) => ({ label: g.genre, value: g.share, display: `${Math.round(g.share * 100)}%` }))} />
          </Panel>
          <Panel title="Come voti" titleId="dist-h">
            <ColumnChart
              caption="Numero di titoli per voto"
              height={170}
              columns={p.distribution.map((n, i) => ({
                label: (i + 1) % 2 === 0 ? String((i + 1) / 2) : "",
                value: n,
                display: `${avg(i + 1)} stelle: ${n === 1 ? "1 titolo" : `${n} titoli`}`,
              }))}
            />
          </Panel>
        </div>
      </RevealItem>

      <RevealItem as="section">
        <SectionHeader id="social-h" title="Tra i tuoi amici" description="Titoli su cui almeno due amici sono d'accordo." />
        {friendCount === 0 ? (
          <EmptyState icon={<Users />} title="Aggiungi amici per scoprire cosa stanno guardando." action={<ButtonLink href="/friends">Trova amici</ButtonLink>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="I più visti" titleId="most-watched">
              <RankedList
                empty="Ancora nessun titolo in comune."
                items={s.mostWatched.map((t) => ({ title: t.title, sub: names(t.friends), right: <AvatarStack users={t.friends} size="xs" max={3} /> }))}
              />
            </Panel>
            <Panel title="I più apprezzati" titleId="best-rated">
              <RankedList
                empty="Servono almeno due voti per titolo."
                items={s.bestRated.map((t) => ({
                  title: t.title,
                  sub: `${t.votes} voti`,
                  right: <span className="text-sm font-medium tabular text-fg">{avg(t.value)}</span>,
                }))}
              />
            </Panel>
            <Panel title="I più desiderati" titleId="most-wanted">
              <RankedList
                empty="Nessun titolo in più wishlist."
                items={s.mostShared.map((t) => ({ title: t.title, sub: names(t.friends), right: <AvatarStack users={t.friends} size="xs" max={3} /> }))}
              />
            </Panel>
          </div>
        )}
      </RevealItem>
    </Reveal>
  );
}
