import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getAniDbAnime, getAnnAnime } from "@/integrations/catalog/anidb-first";
import { providerSearchUrl } from "@/integrations/providers/search-links";
import { AnimeWatchPath } from "@/components/anime/anime-watch-path";
import { SectionHeader } from "@/components/ui/section-header";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";

export const metadata: Metadata = { title: "Scheda anime" };

const relationLabel: Record<string, string> = {
  sequel: "Sequel",
  prequel: "Prequel",
  side_story: "Storia parallela",
  parent_story: "Opera principale",
  alternative_setting: "Ambientazione alternativa",
  alternative_version: "Versione alternativa",
  summary: "Riassunto",
  full_story: "Storia completa",
};

async function AnimeDetailContent({ params }: PageProps<"/anime/[id]">) {
  // cacheComponents is enabled: user, database, and AniDB data are request-time.
  await connection();
  const { id: rawId } = await params;
  const anidbId = Number(rawId);
  if (!Number.isSafeInteger(anidbId) || anidbId < 1) notFound();

  const anime = await getAniDbAnime(anidbId);
  if (!anime) notFound();

  const relatedRecords = await Promise.all(
    anime.relations.slice(0, 12).map(async (relation) => ({
      relation,
      anime: await getAniDbAnime(Number(relation.id.replace(/^anidb-/, ""))),
    })),
  );
  const related = relatedRecords.filter((item): item is typeof item & { anime: NonNullable<typeof item.anime> } => item.anime !== null);
  const watchNodes = [
    { id: anime.id, title: anime.title, relation: "parent_story", url: anime.anidbUrl, episodeCount: anime.episodeCount },
    ...related.map(({ relation, anime: item }) => ({
      id: item.id,
      title: item.title,
      relation: relation.type,
      url: item.anidbUrl,
      episodeCount: item.episodeCount,
    })),
  ];
  const user = await getCurrentUser();
  const savedPath = await getRepository().listAnimeWatchPath(user.id, anime.id);
  const initialPlan = Object.fromEntries(savedPath.map((entry) => [entry.animeId, { include: entry.included, watched: entry.watched }]));
  const animeUnitySearch = providerSearchUrl("animeunity", anime.title);
  const annId = anime.annIds[0] ?? null;
  const ann = annId ? await getAnnAnime(annId) : null;

  return (
    <div className="space-y-8">
      <Link href="/anime" className="text-sm text-fg-2 hover:text-fg">← Libreria anime</Link>
      <section className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
        {anime.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anime.posterUrl} alt={`Locandina di ${anime.title}`} className="aspect-[2/3] w-full max-w-[150px] rounded-xl border border-line object-cover" />
        ) : (
          <div aria-hidden className="aspect-[2/3] w-full max-w-[150px] rounded-xl border border-line bg-surface" />
        )}
        <div className="min-w-0">
          <SectionHeader as="h1" title={anime.title} description={[anime.year, anime.format, anime.episodeCount ? `${anime.episodeCount} episodi` : null].filter(Boolean).join(" · ")} />
          <p className="text-sm leading-relaxed text-fg-2">Scheda canonica AniDB. I titoli correlati sono mantenuti come opere distinte e organizzati secondo il tipo di relazione indicato dalla fonte.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={anime.anidbUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-sm hover:bg-white/[0.05]">AniDB <ExternalLink aria-hidden className="size-3.5" /></a>
            {annId && <a href={ann?.url ?? `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${annId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-sm hover:bg-white/[0.05]">Anime News Network <ExternalLink aria-hidden className="size-3.5" /></a>}
            {animeUnitySearch && <a href={animeUnitySearch} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-sm hover:bg-white/[0.05]">Cerca su AnimeUnity <ExternalLink aria-hidden className="size-3.5" /></a>}
            <a href={anime.fillerListUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-sm hover:bg-white/[0.05]">Quick List filler <ExternalLink aria-hidden className="size-3.5" /></a>
          </div>
          {ann && <p className="mt-3 text-xs text-fg-3">Dati ANN: {ann.title ?? anime.title}{ann.episodeCount ? ` · ${ann.episodeCount} episodi registrati` : ""}. <a className="underline" href={ann.url} target="_blank" rel="noreferrer">Fonte: Anime News Network</a>.</p>}
          <p className="mt-3 text-xs text-fg-3">La ricerca AnimeUnity apre i risultati, non un episodio specifico. Il deep link esatto verrà usato quando è noto dalla riproduzione o da un’associazione verificata.</p>
        </div>
      </section>

      <AnimeWatchPath key={anime.id} rootId={anime.id} nodes={watchNodes} initialPlan={initialPlan} />

      <section aria-labelledby="anime-relations-title" className="space-y-3">
        <SectionHeader as="h2" title="Opere correlate" id="anime-relations-title" description="La relazione non implica automaticamente che l’opera sia obbligatoria nel tuo percorso." />
        {related.length === 0 ? (
          <p className="rounded-xl border border-line p-4 text-sm text-fg-2">AniDB non restituisce relazioni per questa voce, oppure la fonte non è disponibile al momento.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {related.map(({ relation, anime: item }) => (
              <li key={item.id}>
                <Link href={`/anime/${item.anidbId}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
                  <span className="block text-xs text-fg-3">{relationLabel[relation.type] ?? relation.type.replaceAll("_", " ")}</span>
                  <span className="mt-1 block text-sm font-semibold">{item.title}</span>
                  <span className="mt-1 block text-xs text-fg-3">{[item.year, item.format, item.episodeCount ? `${item.episodeCount} episodi` : null].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-fg-3">Dati d’identità e relazioni forniti da AniDB tramite animap. Dati ANN: attribuzione e collegamento alla relativa voce quando disponibile. Immagini e dati restano soggetti alle condizioni delle rispettive fonti.</p>
    </div>
  );
}


export default function AnimeDetailPage(props: PageProps<"/anime/[id]">) {
  return (
    <Suspense fallback={<div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-surface" /><div className="h-40 max-w-3xl animate-pulse rounded-xl bg-surface" /></div>}>
      <AnimeDetailContent params={props.params} />
    </Suspense>
  );
}
