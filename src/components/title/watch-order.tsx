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
}: {
  titleId: string;
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

  return (
    <div>
      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {parts.map((part, i) => {
          const on = chosen[part.key] ?? includedByDefault(part);
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
                  {detail(part)}
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
