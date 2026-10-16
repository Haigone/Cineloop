import Image from "next/image";
import type { Wrapped } from "@/lib/wrapped";
import { formatDuration } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/profile/column-chart";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** The template: only the numbers change from one person to the next. */
export function WrappedCard({ wrapped }: { wrapped: Wrapped }) {
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
