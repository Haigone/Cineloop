"use client";

import { useState, useTransition } from "react";
import type { Title } from "@/domain/types";
import { rateTitle } from "@/server/actions/library";
import { ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PickTile } from "@/components/explore/taste-picker";

/**
 * First access: the fixed pool of Netflix series, by category. Each tap
 * saves the series as seen with a 4-star rating, which "Per te" builds on.
 */
export function SeriesPicker({ groups, target, initial }: { groups: { category: string; titles: Title[] }[]; target: number; initial: string[] }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(initial));
  const [, startTransition] = useTransition();
  const toast = useToast();

  function toggle(t: Title) {
    const on = !picked.has(t.id);
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(t.id);
      else next.delete(t.id);
      return next;
    });
    startTransition(async () => {
      const res = await rateTitle(t.id, on ? 8 : null);
      if (!res.ok) toast.show(res.error, { tone: "error" });
    });
  }

  const done = picked.size >= target;
  return (
    <>
      <div className="flex flex-col gap-9">
        {groups.map((g) => (
          <section key={g.category} aria-labelledby={`cat-${g.category}`}>
            <h2 id={`cat-${g.category}`} className="mb-3 text-[15px] font-semibold text-fg">
              {g.category}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
              {g.titles.map((t) => (
                <li key={t.id}>
                  <PickTile title={t} on={picked.has(t.id)} onToggle={() => toggle(t)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 z-10 -mx-4 mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur-md md:bottom-4 md:mx-0 md:rounded-xl md:border">
        <p className="text-sm text-fg-2 tabular" aria-live="polite">
          {picked.size === 0
            ? `Scegline almeno ${target}.`
            : done
              ? `${picked.size} scelte: basta così per i primi consigli.`
              : `${picked.size} su ${target}: ancora ${target - picked.size}.`}
        </p>
        <div className="flex gap-2">
          {!done && (
            <ButtonLink href="/home" variant="ghost">
              Salta
            </ButtonLink>
          )}
          <ButtonLink href="/explore" variant={done ? "primary" : "secondary"}>
            Vedi i consigli per te
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
