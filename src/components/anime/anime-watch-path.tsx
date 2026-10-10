"use client";

import { useMemo, useState } from "react";
import { saveAnimeWatchPath } from "@/server/actions/anime";
import { useToast } from "@/components/ui/toast";

type Node = { id: string; title: string; relation: string; url: string; episodeCount: number | null; watchable: boolean };
type Role = "required" | "optional" | "skipped";
type Choice = { include: boolean; role: Role; watched: boolean; watchedEpisodes?: string[] };
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
    const included = nodes.filter((node) => node.watchable && (plan[node.id]?.role ?? "required") !== "skipped");
    const units = (node: Node) => Math.max(1, node.episodeCount ?? 1);
    const total = included.reduce((sum, node) => sum + units(node), 0);
    const watched = included.reduce((sum, node) => {
      const choice = plan[node.id];
      const count = choice?.watched ? units(node) : Math.min(units(node), new Set(choice?.watchedEpisodes ?? []).size);
      return sum + count;
    }, 0);
    return { total, watched, remaining: total - watched };
  }, [nodes, plan]);

  async function update(id: string, patch: Partial<Choice>) {
    const current = plan[id] ?? { include: true, role: "required" as const, watched: false };
    const role = patch.role ?? current.role;
    const next = { ...current, ...patch, role, include: role !== "skipped" };
    if (!next.include) next.watched = false;
    setPlan((previous) => ({ ...previous, [id]: next }));
    const result = await saveAnimeWatchPath(rootId, id, next.role, next.watched);
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
          <p className="mt-1 text-sm text-fg-2">Imposta cosa è obbligatorio, facoltativo o da saltare; segna le opere completate.</p>
        </div>
        <p aria-live="polite" className="text-sm tabular-nums text-fg-2">
          {progress.watched}/{progress.total} episodi-equivalenti visti · {progress.remaining} da vedere
        </p>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {nodes.map((node) => {
          const choice = plan[node.id] ?? { include: true, role: "required" as const, watched: false, watchedEpisodes: [] };
          return (
            <li key={node.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${choice.include ? "" : "text-fg-3 line-through"}`}>{node.title}</span>
                  <span className="block text-xs text-fg-3">
                    {RELATION_LABEL[node.relation] ?? node.relation.replaceAll("_", " ")}
                    {node.episodeCount ? ` · ${node.episodeCount} episodi` : ""}
                    {!node.watchable ? " · Non conteggiato nel progresso" : ""}
                  </span>
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-2">
                <span className="sr-only">Tipo di percorso per {node.title}</span>
                <select
                  aria-label={`Tipo di percorso per ${node.title}`}
                  value={choice.role}
                  disabled={!node.watchable}
                  onChange={(event) => void update(node.id, { role: event.target.value as Role })}
                  className="h-8 rounded-md border border-line bg-surface px-2 text-xs disabled:opacity-50"
                >
                  <option value="required">Obbligatorio</option>
                  <option value="optional">Facoltativo</option>
                  <option value="skipped">Da saltare</option>
                </select>
              </label>
              <label className={`flex items-center gap-2 text-xs ${choice.include && node.watchable ? "text-fg-2" : "text-fg-3"}`}>
                <input
                  type="checkbox"
                  disabled={!choice.include || !node.watchable}
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
      <p className="text-xs leading-relaxed text-fg-3">
        Le scelte vengono salvate nel tuo account CineLoop. Il progresso episodio per episodio si sincronizza quando il player segnala almeno il 90% di visione e il collegamento AniDB–TMDB è univoco; le mappature ambigue non vengono conteggiate per evitare duplicati.
      </p>
    </section>
  );
}
