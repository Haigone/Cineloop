import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pencil } from "lucide-react";
import { getProfileView } from "@/server/services/profile";
import { formatDuration, MEDIA_TYPE_LABEL } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { RatingStars } from "@/components/ui/rating-stars";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { BarList } from "@/components/profile/bar-list";
import { ColumnChart } from "@/components/profile/column-chart";
import { RankedList } from "@/components/rankings/ranked-list";

export const metadata: Metadata = { title: "Profilo" };

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Caricamento del profilo" className="space-y-6">
          <Skeleton className="h-36 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </LoadingRegion>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}

const memberSince = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

async function ProfileContent() {
  const v = await getProfileView();
  const { user, summary: s } = v;
  const stats = [
    { label: "Film visti", value: String(s.movies) },
    { label: "Serie", value: String(s.series) },
    { label: "Anime", value: String(s.anime) },
    { label: "In wishlist", value: String(s.wishlist) },
    { label: "Voto medio", value: s.averageRating == null ? "–" : (s.averageRating / 2).toLocaleString("it-IT", { maximumFractionDigits: 1 }) },
    { label: "Tempo di visione", value: formatDuration(v.totalMinutes) },
  ];
  const weekTotal = v.week.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <Reveal className="space-y-8">
      <RevealItem as="header" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-5 md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 md:gap-5">
            <Avatar user={user} size="xl" className="max-sm:hidden" />
            <Avatar user={user} size="lg" className="sm:hidden" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-[28px]">{user.displayName}</h1>
              <p className="text-sm text-fg-3">
                @{user.username} · su CineLoop da {memberSince.format(new Date(user.createdAt))} ·{" "}
                <Link href="/friends" className="rounded-sm text-fg-2 hover:text-fg hover:underline hover:underline-offset-4">
                  {v.friendCount === 1 ? "1 amico" : `${v.friendCount} amici`}
                </Link>
              </p>
              {user.bio && <p className="mt-2 max-w-[60ch] text-sm text-fg-2">{user.bio}</p>}
            </div>
          </div>
          <ButtonLink href="/settings" variant="secondary" icon={<Pencil aria-hidden className="size-4" />} className="self-start sm:self-center">
            Modifica profilo
          </ButtonLink>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((st) => (
            <div key={st.label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-fg-3">{st.label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tracking-[-0.02em] tabular">{st.value}</dd>
            </div>
          ))}
        </dl>
      </RevealItem>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevealItem>
          <Panel title="Generi preferiti" titleId="genres-h" className="h-full">
            {v.genres.length === 0 ? (
              <p className="py-4 text-sm text-fg-2">Valuta qualche titolo per scoprire i tuoi generi.</p>
            ) : (
              <BarList
                label="Quota di visioni per genere"
                items={v.genres.map((g) => ({ label: g.genre, value: g.share, display: `${Math.round(g.share * 100)}%` }))}
              />
            )}
          </Panel>
        </RevealItem>
        <RevealItem>
          <Panel
            title="Ultimi 7 giorni"
            titleId="week-h"
            className="h-full"
            action={<span className="text-sm text-fg-2 tabular">{formatDuration(weekTotal)}</span>}
          >
            <ColumnChart
              caption="Minuti di visione per giorno"
              highlightLast
              height={160}
              columns={v.week.map((d) => ({ label: d.day, value: d.minutes, display: d.minutes ? formatDuration(d.minutes) : "Nessuna visione" }))}
            />
          </Panel>
        </RevealItem>
      </div>

      <RevealItem>
        <Panel
          title="I tuoi preferiti"
          titleId="top-h"
          action={
            <Link href="/rankings" className="rounded-sm text-[13px] text-fg-2 hover:text-fg">
              Tutte le classifiche
            </Link>
          }
        >
          <RankedList
            empty="Quando valuti un titolo, i tuoi preferiti compaiono qui."
            items={v.top.map((t) => ({ title: t.title, sub: MEDIA_TYPE_LABEL[t.title.type], right: <RatingStars value={t.value} /> }))}
          />
        </Panel>
      </RevealItem>
    </Reveal>
  );
}
