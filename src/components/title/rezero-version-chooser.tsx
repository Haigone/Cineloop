"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setPartIncluded, setStatus } from "@/server/actions/library";
import { useToast } from "@/components/ui/toast";

type Version = "directors-cut" | "2016";

export function ReZeroVersionChooser({
  titleId,
  status,
  version,
}: {
  titleId: string;
  status: "watching" | "completed" | null;
  version: Version | null;
}) {
  const [selected, setSelected] = useState<Version | null>(version);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function choose(next: Version) {
    const previous = selected;
    setSelected(next);
    startTransition(async () => {
      const result = status
        ? await setPartIncluded(titleId, "rezero-version", next === "directors-cut")
        : await setStatus(titleId, "watching", next);
      if (!result.ok) {
        setSelected(previous);
        toast.show(result.error, { tone: "error" });
      } else {
        toast.show(
          next === "directors-cut"
            ? "Director’s Cut selezionata: l’ordine di visione è stato aggiornato"
            : "Versione originale 2016 selezionata: la Director’s Cut verrà saltata",
          { tone: "success" },
        );
      }
    });
  }

  const options: { id: Version; title: string; description: string }[] = [
    {
      id: "directors-cut",
      title: "Segui la Director’s Cut",
      description: "13 episodi più lunghi, circa un’ora ciascuno. La versione rimontata con scene aggiuntive.",
    },
    {
      id: "2016",
      title: "Segui la versione originale 2016",
      description: "25 episodi nel formato originale. La Director’s Cut viene saltata nell’ordine di visione.",
    },
  ];

  return (
    <section aria-labelledby="rezero-version-heading" className="mt-5 border-t border-line pt-4">
      <h3 id="rezero-version-heading" className="text-sm font-semibold">Come vuoi seguire Re:ZERO?</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">
        Scegli una sola versione della prima stagione. La preferenza resta salvata e aggiorna automaticamente l’ordine di visione.
      </p>
      <div className="mt-3 grid gap-2">
        {options.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => choose(option.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${active ? "border-accent bg-accent/10" : "border-line hover:border-line-strong hover:bg-white/[0.03]"}`}
            >
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${active ? "border-accent bg-accent text-white" : "border-line-strong"}`}>
                {active && <Check aria-hidden className="size-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-3">{option.description}</span>
                {active && <span className="mt-2 block text-xs font-medium text-fg">Selezionata</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
