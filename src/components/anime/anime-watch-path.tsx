"use client";

import { useMemo, useState } from "react";
import { saveAnimeWatchPath } from "@/server/actions/anime";
import { useToast } from "@/components/ui/toast";

type Node = { id: string; title: string; relation: string; url: string; episodeCount: number | null };
type Choice = { include: boolean; watched: boolean };
type SavedPlan = Record<string, Choice>;

const RELATION_LABEL: Record<string, string> = {
  sequel: "Sequel",
  prequel: "Prequel",
  side_story: "Storia parallela",
  parent_story: "Opera principale",
  alternative_setting: "Ambientazione alternativa",
  alternative_version: "Versione alternativa",
  character: "Personaggi in comune",
  summary: "Riassunto",
  full_story: "Storia completa",
  other: "Correlato",
};

export function AnimeWatchPath({
  rootId,
  nodes,
  initialPlan,
}: {
  rootId: string;
  nodes: Node[];
  initialPlan: SavedPlan;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<SavedPlan>(initialPlan);

  const progress = useMemo(() => {
    const included = nodes.filter((node) => plan[node.id]?.include ?? true);
    const watched = included.filter((node) => plan[node.id]?.watched).length;
    return { included: included.length, watched, remaining: included.length - watched };
  }, [nodes, plan]);

  async function update(id: string, patch: Partial<Choice>) {
    const current = plan[id] ?? { include: true, watched: false };
    const next = { ...current, ...patch };
    if (!next.include) next.watched = false;
    setPlan((previous) => ({ ...previous, [id]: next }));
    const result = await saveAnimeWatchPath(rootId, id, next.include, next.watched);
    if (!result.ok) {
      setPlan((previous) => ({ ...previous, [id]: current }));
      toast.show(result.error, { tone: "error" });
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="watch-path-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="watch-path-title" className="text-base font-semibold">Il tuo percorso di visione</h2>
          <p className="mt-1 text-sm text-fg-2">Escludi ciò che non vuoi vedere e spunta gli elementi completati.</p>
        </div>
        <p aria-live="polite" className="text-sm tabular-nums text-fg-2">
          {progress.watched}/{progress.included} visti · {progress.remaining} da vedere
        </p>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {nodes.map((node) => {
          const choice = plan[node.id] ?? { include: true, watched: false };
          return (
            <li key={node.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={choice.include}
                  onChange={(event) => void update(node.id, { include: event.target.checked })}
                  className="size-4 accent-current"
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${choice.include ? "" : "text-fg-3 line-through"}`}>{node.title}</span>
                  <span className="block text-xs text-fg-3">{RELATION_LABEL[node.relation] ?? node.relation.replaceAll("_", " ")}{node.episodeCount ? ` · ${node.episodeCount} episodi` : ""}</span>
                </span>
              </label>
              <label className={`flex items-center gap-2 text-xs ${choice.include ? "text-fg-2" : "text-fg-3"}`}>
                <input
                  type="checkbox"
                  disabled={!choice.include}
                  checked={choice.watched}
                  onChange={(event) => void update(node.id, { watched: event.target.checked })}
                  className="size-4 accent-current"
                />
                Visto
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-fg-3">Le scelte vengono salvate nel tuo account CineLoop e associate al percorso di questa opera. Il conteggio è personale e non include gli elementi esclusi.</p>
    </section>
  );
}
