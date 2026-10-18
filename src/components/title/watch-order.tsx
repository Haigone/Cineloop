"use client";

import { useState, useTransition } from "react";
import type { WatchPart } from "@/domain/types";
import { FILLER_KEY, includedByDefault, type Overrides } from "@/domain/watch-order";
import { setPartIncluded } from "@/server/actions/library";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const KIND_LABEL: Record<WatchPart["kind"], string> = { season: "Serie", movie: "Film", ova: "OVA", special: "Speciale" };

function detail(part: WatchPart): string {
  const bits = [KIND_LABEL[part.kind]];
  if (part.year) bits.push(String(part.year));
  if (part.episodes) bits.push(part.episodes === 1 ? "1 episodio" : `${part.episodes} episodi`);
  return bits.join(" · ");
}

/**
 * The franchise in watching order, each part with a switch: what is on counts
 * towards progress and "finished", what is off is left out. Choices are saved
 * once the title is in the library.
 */
export function WatchOrder({
  titleId,
  parts,
  overrides,
  canChoose,
  titleName,
}: {
  titleId: string;
  titleName: string;
  parts: WatchPart[];
  overrides: Overrides;
  canChoose: boolean;
}) {
  const [chosen, setChosen] = useState<Record<string, boolean>>(overrides ?? {});
  const [, startTransition] = useTransition();
  const toast = useToast();
  const hasFiller = parts.some((p) => p.filler?.length);
  const fillerCount = parts.reduce((n, p) => n + (p.filler?.length ?? 0), 0);

  function choose(key: string, included: boolean, fallback: boolean) {
    const before = chosen;
    // Going back to the default is stored as no choice at all.
    const next = { ...chosen };
    if (included === fallback) delete next[key];
    else next[key] = included;
    setChosen(next);
    startTransition(async () => {
      const res = await setPartIncluded(titleId, key, included === fallback ? null : included);
      if (!res.ok) {
        setChosen(before);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  const isReZero = /re\s*:?\s*zero/i.test(titleName);
  const reZeroVersion = chosen["rezero-version"] === undefined ? null : chosen["rezero-version"] ? "directors-cut" : "2016";

  function chooseReZeroVersion(version: "directors-cut" | "2016") {
    const included = version === "directors-cut";
    const before = chosen;
    setChosen({ ...chosen, "rezero-version": included });
    startTransition(async () => {
      const res = await setPartIncluded(titleId, "rezero-version", included);
      if (!res.ok) {
        setChosen(before);
        toast.show(res.error, { tone: "error" });
      } else {
        toast.show("Ordine di visione di Re:Zero aggiornato", { tone: "success" });
      }
    });
  }

  return (
    <div>
      {isReZero && (
        <div className="mb-3 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold">Prima stagione di Re:Zero</h3>
          <p className="mt-1 text-xs text-fg-3">La scelta determina quale versione viene associata alla stagione 1 e quali ID AnimeUnity usare quando modifichi l’episodio.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className={cn("flex items-start gap-2 rounded-lg border border-line p-3", canChoose ? "cursor-pointer" : "opacity-70")}>
              <input type="radio" name="rezero-watch-order" className="mt-1" checked={reZeroVersion === "directors-cut"} disabled={!canChoose} onChange={() => chooseReZeroVersion("directors-cut")} />
              <span>
                <span className="block text-sm font-medium">Director’s Cut (2019)</span>
                <span className="mt-1 block text-xs text-fg-3">13 episodi più lunghi, rimontati dal formato originale, con alcune scene aggiuntive.</span>
              </span>
            </label>
            <label className={cn("flex items-start gap-2 rounded-lg border border-line p-3", canChoose ? "cursor-pointer" : "opacity-70")}>
              <input type="radio" name="rezero-watch-order" className="mt-1" checked={reZeroVersion === "2016"} disabled={!canChoose} onChange={() => chooseReZeroVersion("2016")} />
              <span>
                <span className="block text-sm font-medium">Versione originale (2016)</span>
                <span className="mt-1 block text-xs text-fg-3">25 episodi nel montaggio e nel ritmo della prima trasmissione.</span>
              </span>
            </label>
          </div>
          {!canChoose && <p className="mt-2 text-xs text-fg-3">Aggiungi Re:Zero alla libreria per salvare o modificare la scelta.</p>}
        </div>
      )}
      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {parts.map((part, i) => {
          const on = chosen[part.key] ?? includedByDefault(part);
          const displayedPart = isReZero && part.kind === "season" && part.season === 1 && reZeroVersion
            ? { ...part, episodes: reZeroVersion === "directors-cut" ? 13 : 25 }
            : part;
          const labelId = `part-${part.key}`;
          return (
            <li key={part.key} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden className="w-6 shrink-0 text-center text-sm tabular text-fg-3">
                {i + 1}
              </span>
              <div className={cn("min-w-0 flex-1", !on && "opacity-60")}>
                <p id={labelId} className="truncate text-sm font-medium">
                  {part.name}
                </p>
                <p className="mt-0.5 text-xs text-fg-3">
                  {detail(displayedPart)}
                  {part.canon === false && " · non canon"}
                  {part.filler?.length ? ` · ${part.filler.length} filler` : ""}
                </p>
              </div>
              <Switch
                checked={on}
                onChange={(v) => choose(part.key, v, includedByDefault(part))}
                labelledBy={labelId}
                disabled={!canChoose}
              />
            </li>
          );
        })}
      </ol>
      {hasFiller && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <p id="part-filler" className="text-sm font-medium">
              Guarda anche i filler
            </p>
            <p className="mt-0.5 text-xs text-fg-3">{fillerCount} episodi che non vengono dal manga: di base li saltiamo.</p>
          </div>
          <Switch
            checked={chosen[FILLER_KEY] === true}
            onChange={(v) => choose(FILLER_KEY, v, false)}
            labelledBy="part-filler"
            disabled={!canChoose}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-fg-3">
        {canChoose
          ? "Quello che è spento non conta per il progresso e per “finito”."
          : "Potrai scegliere cosa includere appena inizi a guardarlo."}{" "}
        Ordine di uscita; i dati vengono da Anime News Network e Anime Filler List.
      </p>
    </div>
  );
}
