"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { Title } from "@/domain/types";
import { rateTitle } from "@/server/actions/library";
import { cn } from "@/lib/cn";
import { KeyArt } from "@/components/media/key-art";
import { useToast } from "@/components/ui/toast";

/**
 * Cold start for "Per te": tap the titles you have seen and liked. Each tap
 * saves a 4-star rating, which is what recommendations are built from.
 */
export function TastePicker({ titles, liked, target }: { titles: Title[]; liked: number; target: number }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();
  const toast = useToast();
  const count = liked + picked.size;

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

  return (
    <section aria-labelledby="taste-h" className="rounded-xl border border-line bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="taste-h" className="text-[17px] font-semibold tracking-[-0.01em]">
          Quali di questi hai visto e ti sono piaciuti?
        </h2>
        <p className="text-sm text-fg-2 tabular" aria-live="polite">
          {count >= target ? "Fatto: i consigli qui sotto partono da qui" : `Ne servono ancora ${target - count}`}
        </p>
      </div>
      <p className="mt-1 max-w-[62ch] text-sm text-fg-2">Bastano pochi tocchi: da questi titoli costruisco i consigli “Per te”.</p>
      <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
        {titles.map((t) => (
          <li key={t.id}>
            <PickTile title={t} on={picked.has(t.id)} onToggle={() => toggle(t)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A poster that toggles: "seen and liked". */
export function PickTile({ title, on, onToggle }: { title: Title; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="group/pick block w-full rounded-lg text-left"
    >
      <span className="relative block">
        <KeyArt
          title={title}
          variant="poster"
          showTitle
          className={cn("aspect-[2/3] rounded-lg border transition-[border-color,opacity]", on ? "border-accent" : "border-line group-hover/pick:border-white/25")}
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border transition-colors",
            on ? "border-transparent bg-accent-fill text-white" : "border-white/30 bg-black/40 text-transparent",
          )}
        >
          <Check className="size-3.5" />
        </span>
      </span>
      <span className="mt-1.5 block truncate text-xs text-fg-2">{title.title}</span>
    </button>
  );
}
