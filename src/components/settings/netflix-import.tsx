"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { itemsFor, profilesIn, readRatings, readViewing, type ExportItem } from "@/lib/netflix-export";
import { applyNetflixBatch, reviewNetflixBatch, type ImportChoice, type ReviewRow } from "@/server/actions/netflix-import";
import { Button } from "@/components/ui/button";

type Files = { viewing: ReturnType<typeof readViewing>; ratings: ReturnType<typeof readRatings> };
type Phase = "pick" | "reading" | "review" | "applying" | "done";

const BATCH = 8;
const APPLY_BATCH = 20;

/**
 * Import of the viewer's own Netflix data export. Rows that agree with the library go in; where the library
 * already says something else the viewer picks a side, row by row.
 */
export function NetflixImport() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [files, setFiles] = useState<Files | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [profile, setProfile] = useState("");
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [useNetflix, setUseNetflix] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<{ imported: number; skipped: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = useRef<ExportItem[]>([]);

  async function pick(list: FileList | null) {
    setError(null);
    if (!list?.length) return;
    const next: Files = { viewing: [], ratings: [] };
    for (const file of Array.from(list)) {
      const text = await file.text();
      const head = (text.split(/\r?\n/, 1)[0] ?? "").toLowerCase();
      if (head.includes("thumbs") || head.includes("title name")) next.ratings.push(...readRatings(text));
      else if (head.includes("start time") || head.includes("duration")) next.viewing.push(...readViewing(text));
    }
    if (next.viewing.length === 0 && next.ratings.length === 0) {
      setError("Non riconosco questi file. Servono ViewingActivity.csv e, per i voti, Ratings.csv dall’esportazione di Netflix.");
      return;
    }
    const names = profilesIn(next.viewing, next.ratings);
    setFiles(next);
    setProfiles(names);
    setProfile(names[0] ?? "");
  }

  async function analyse() {
    if (!files) return;
    setPhase("reading");
    setError(null);
    items.current = itemsFor(profile, files.viewing, files.ratings);
    const all = items.current;
    setProgress([0, all.length]);
    const out: ReviewRow[] = [];
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const batch = all.slice(i, i + BATCH).map(({ name, kind, seasons, thumbs }) => ({ name, kind, seasons, thumbs }));
        out.push(...(await reviewNetflixBatch(batch)));
        setProgress([Math.min(i + BATCH, all.length), all.length]);
      }
    } catch {
      setError("L’analisi si è interrotta. Riprova: i titoli già confrontati non cambiano nulla finché non importi.");
      setPhase("pick");
      return;
    }
    setRows(out);
    setUseNetflix({});
    setPhase("review");
  }

  const conflicts = rows.filter((r) => r.action === "conflict");
  const ready = rows.filter((r) => r.action === "add" || r.action === "fill");
  const same = rows.filter((r) => r.action === "same");
  const missing = rows.filter((r) => r.action === "notfound");
  const undecided = conflicts.filter((r) => useNetflix[r.titleId!] === undefined);

  async function apply() {
    setPhase("applying");
    const chosen: ImportChoice[] = rows
      .filter((r) => r.titleId && (r.action === "add" || r.action === "fill" || (r.action === "conflict" && useNetflix[r.titleId] === true)))
      .map((r) => ({ item: { name: r.name, kind: r.kind, seasons: r.seasons, thumbs: r.thumbs }, titleId: r.titleId!, useNetflix: r.action === "conflict" }));
    const total = { imported: 0, skipped: conflicts.length - chosen.filter((c) => c.useNetflix).length, failed: [] as string[] };
    setProgress([0, chosen.length]);
    try {
      for (let i = 0; i < chosen.length; i += APPLY_BATCH) {
        const res = await applyNetflixBatch(chosen.slice(i, i + APPLY_BATCH));
        total.imported += res.imported;
        total.skipped += res.skipped;
        total.failed.push(...res.failed);
        setProgress([Math.min(i + APPLY_BATCH, chosen.length), chosen.length]);
      }
    } catch {
      setError("L’importazione si è interrotta: quello che era già stato salvato resta, puoi ripetere senza duplicati.");
    }
    setSummary(total);
    setPhase("done");
  }

  function reset() {
    setPhase("pick");
    setFiles(null);
    setRows([]);
    setSummary(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-fg">
          {error}
        </p>
      )}

      {phase === "pick" && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">
            <li>Su Netflix apri Account, “Scarica le tue informazioni personali” e chiedi il file.</li>
            <li>Quando arriva la mail, scarica lo zip e scegli qui <code className="text-fg">ViewingActivity.csv</code> e <code className="text-fg">Ratings.csv</code>.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-white/[0.04] px-4 text-sm text-fg hover:bg-white/[0.08] focus-within:ring-2 focus-within:ring-accent">
              <FileUp aria-hidden className="size-4" />
              Scegli i file CSV
              <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => void pick(e.target.files)} />
            </label>
            {files && <span className="text-sm text-fg-2">{files.viewing.length} visioni, {files.ratings.length} voti letti</span>}
          </div>
          {files && profiles.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
                Profilo Netflix
                <select value={profile} onChange={(e) => setProfile(e.target.value)} className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm text-fg">
                  {profiles.map((p) => (
                    <option key={p} value={p}>
                      {p || "(senza nome)"}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void analyse()}>Confronta con la libreria</Button>
            </div>
          )}
        </>
      )}

      {(phase === "reading" || phase === "applying") && (
        <p role="status" className="text-sm text-fg-2">
          {phase === "reading" ? "Confronto i titoli" : "Importo"}: {progress[0]} di {progress[1]}…
        </p>
      )}

      {phase === "review" && (
        <>
          <p className="text-sm text-fg-2">
            {ready.length} da importare · {conflicts.length} conflitti · {same.length} già a posto · {missing.length} non trovati. Non cambia nulla finché non premi Importa.
          </p>

          {conflicts.length > 0 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-fg">Scegli cosa tenere ({undecided.length} da decidere)</legend>
              {conflicts.map((r) => (
                <div key={r.titleId} role="radiogroup" aria-label={r.title ?? r.name} className="rounded-md border border-line p-3 text-sm">
                  <p className="font-medium text-fg">
                    {r.title} {r.year ? <span className="text-fg-3">({r.year})</span> : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                    <label className="flex items-center gap-2 text-fg-2">
                      <input type="radio" name={`c-${r.titleId}`} checked={useNetflix[r.titleId!] === false} onChange={() => setUseNetflix((s) => ({ ...s, [r.titleId!]: false }))} />
                      Tieni CineLoop: {r.mine}
                    </label>
                    <label className="flex items-center gap-2 text-fg-2">
                      <input type="radio" name={`c-${r.titleId}`} checked={useNetflix[r.titleId!] === true} onChange={() => setUseNetflix((s) => ({ ...s, [r.titleId!]: true }))} />
                      Usa Netflix: {r.theirs}
                    </label>
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          {ready.length > 0 && (
            <details className="text-sm text-fg-2">
              <summary className="cursor-pointer text-fg">Titoli che verranno aggiunti o completati ({ready.length})</summary>
              <ul className="mt-2 max-h-56 space-y-1 overflow-auto pr-2">
                {ready.map((r) => (
                  <li key={r.titleId}>
                    {r.title} <span className="text-fg-3">· {r.action === "fill" ? `solo il voto (${r.theirs})` : r.theirs}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {missing.length > 0 && (
            <details className="text-sm text-fg-2">
              <summary className="cursor-pointer text-fg">Non trovati nel catalogo ({missing.length})</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-2">
                {missing.map((r) => (
                  <li key={r.name}>{r.name}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void apply()} disabled={ready.length + conflicts.length === 0}>
              Importa
            </Button>
            <Button variant="ghost" onClick={reset}>
              Annulla
            </Button>
            {undecided.length > 0 && <span className="text-[13px] text-fg-3">I conflitti senza scelta restano come sono.</span>}
          </div>
        </>
      )}

      {phase === "done" && summary && (
        <>
          <p role="status" className="text-sm text-fg">
            Importati {summary.imported} titoli, lasciati invariati {summary.skipped}
            {summary.failed.length > 0 && `, non riusciti ${summary.failed.length}: ${summary.failed.slice(0, 5).join(", ")}`}.
          </p>
          <div>
            <Button variant="secondary" onClick={reset}>
              Importa altri file
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
