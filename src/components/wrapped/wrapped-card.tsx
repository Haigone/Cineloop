import Image from "next/image";
import type { ProviderWrapped, Wrapped } from "@/lib/wrapped";
import { formatDuration } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/profile/column-chart";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** The template: only the numbers change from one person to the next. */
export function WrappedCard({ wrapped, providers = [] }: { wrapped: Wrapped; providers?: ProviderWrapped[] }) {
  const guessShare = wrapped.totalMinutes ? Math.round((wrapped.estimatedMinutes / wrapped.totalMinutes) * 100) : 0;
  const hours = Math.round(wrapped.totalMinutes / 60);
  return (
    <div className="space-y-6">
      <section aria-labelledby="wrapped-total" className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="text-sm text-fg-3">Nel {wrapped.year} hai guardato</p>
        <h2 id="wrapped-total" className="my-2 text-5xl font-semibold tracking-[-0.03em] text-accent">
          {hours.toLocaleString("it-IT")} ore
        </h2>
        <p className="text-sm text-fg-2">
          {formatDuration(wrapped.totalMinutes)} in tutto, cioè circa {(wrapped.totalMinutes / 1440).toFixed(1).replace(".", ",")} giorni di fila.
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat value={wrapped.titles} label="titoli diversi" />
        <Stat value={wrapped.episodes} label="episodi" />
        <Stat value={wrapped.films} label="film" />
      </div>

      <Panel title="I più guardati" titleId="wrapped-top">
        <ol className="space-y-3">
          {wrapped.top.map((t, i) => (
            <li key={t.titleId} className="flex items-center gap-3">
              <span className="w-5 text-right text-sm text-fg-3">{i + 1}</span>
              {t.posterUrl ? <Image src={t.posterUrl} alt="" width={36} height={54} className="rounded-sm" unoptimized /> : <span className="h-[54px] w-9 rounded-sm bg-white/[0.08]" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-fg-3">{t.isFilm ? "Film" : `${t.plays} episodi`}</p>
              </div>
              <span className="text-sm text-fg-2">{formatDuration(t.minutes)}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Mese per mese" titleId="wrapped-months">
        <ColumnChart
          caption={`Ore guardate ogni mese del ${wrapped.year}`}
          columns={wrapped.months.map((m, i) => ({ label: MONTHS[i]!, value: m, display: `${MONTHS[i]}: ${formatDuration(m)}` }))}
        />
        {wrapped.busiestMonth !== null && <p className="mt-3 text-sm text-fg-2">Il tuo mese più intenso è stato {MONTHS_LONG[wrapped.busiestMonth]}.</p>}
      </Panel>

      {providers.length > 0 && (
        <Panel title="Per servizio" titleId="wrapped-providers">
          <div className="space-y-4">
            {providers.map((provider) => (
              <section key={provider.providerId ?? "unknown"} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{provider.providerLabel}</h3>
                    <p className="mt-1 text-xs text-fg-3">
                      Periodo: {new Date(provider.firstWatched + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                      {" – "} 
                      {new Date(provider.lastWatched + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">{Math.round(provider.totalMinutes / 60).toLocaleString("it-IT")} ore</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Visioni" value={provider.episodes + provider.films} />
                  <MiniStat label="Titoli" value={provider.titles} />
                  <MiniStat label="Episodi" value={provider.episodes} />
                  <MiniStat label="Film" value={provider.films} />
                </div>
                <p className="mt-3 text-xs text-fg-3">{provider.sourceDescription}. {formatDuration(provider.estimatedMinutes)} stimati.</p>
              </section>
            ))}
          </div>
        </Panel>
      )}

      {guessShare > 0 && (
        <p className="text-xs text-fg-3">
          Circa il {guessShare}% delle ore è stimato: dallo storico Netflix sappiamo il giorno in cui hai guardato un titolo, non quanto, quindi contiamo la durata di un film o di un episodio tipico per ogni giorno. Le ore vere sono probabilmente di più.
        </p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-2xl font-semibold">{value.toLocaleString("it-IT")}</p>
      <p className="text-xs text-fg-3">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-white/[0.04] p-2"><p className="text-lg font-semibold">{value.toLocaleString("it-IT")}</p><p className="text-xs text-fg-3">{label}</p></div>;
}
