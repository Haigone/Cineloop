"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { requestWrapped } from "@/server/actions/wrapped";
import { readYears, type HistoryRow, type Wrapped } from "@/lib/wrapped";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/profile/column-chart";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Pick the Netflix history file, pick the year, see the Wrapped. The file is read here and never uploaded. */
export function WrappedFlow() {
  const [years, setYears] = useState<Map<number, HistoryRow[]> | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [wrapped, setWrapped] = useState<Wrapped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setWrapped(null);
    setError(null);
    const read = readYears(await file.text());
    if (!read || read.size === 0) {
      setYears(null);
      setError("Questo non sembra lo storico di visione di Netflix (NetflixViewingHistory.csv).");
      return;
    }
    setYears(read);
    // The latest year with something in it.
    setYear(Math.max(...read.keys()));
  }

  function compute() {
    const rows = year !== null ? years?.get(year) : undefined;
    if (year === null || !rows) return;
    setError(null);
    startTransition(async () => {
      const res = await requestWrapped(year, rows);
      if (res.ok) setWrapped(res.wrapped);
      else setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Panel title="Il tuo storico Netflix" titleId="wrapped-file">
        <p className="mb-3 text-sm text-fg-2">
          Su Netflix apri Account › Profilo › Attività di visione › Scarica tutto, poi scegli qui il file. Viene letto sul tuo dispositivo: non lo carichiamo e non lo salviamo.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="File dello storico Netflix" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="secondary" onClick={() => input.current?.click()}>
            Scegli il file
          </Button>
          {years && year !== null && (
            <>
              <label className="flex items-center gap-2 text-sm">
                Anno
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(Number(e.target.value));
                    setWrapped(null);
                  }}
                  className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm"
                >
                  {[...years.keys()].sort((a, b) => b - a).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={compute} disabled={pending}>
                {pending ? "Sto calcolando…" : "Crea il mio Wrapped"}
              </Button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Panel>
      {wrapped && <WrappedCard wrapped={wrapped} />}
    </div>
  );
}

/** The template: only the numbers change from one person to the next. */
export function WrappedCard({ wrapped }: { wrapped: Wrapped }) {
  const hours = Math.round(wrapped.totalMinutes / 60);
  const guessShare = wrapped.totalMinutes ? Math.round((wrapped.estimatedMinutes / wrapped.totalMinutes) * 100) : 0;
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
            <li key={t.name} className="flex items-center gap-3">
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

      {(guessShare > 0 || wrapped.notFound.length > 0) && (
        <p className="text-xs text-fg-3">
          Per circa il {guessShare}% del tempo la durata è stimata (media della stagione o durata tipica).
          {wrapped.notFound.length > 0 && ` Non abbiamo trovato ${wrapped.notFound.length} titoli: ${wrapped.notFound.slice(0, 5).join(", ")}${wrapped.notFound.length > 5 ? "…" : ""}.`}
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
