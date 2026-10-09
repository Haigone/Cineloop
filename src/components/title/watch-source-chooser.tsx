"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import type { ProviderId } from "@/domain/types";
import { chooseWatchProvider } from "@/server/actions/library";
import { useToast } from "@/components/ui/toast";

type Choice = { id: "netflix" | "animeunity"; name: string; url: string; tint: string };

export function WatchSourceChooser({
  titleId,
  titleName,
  choices,
  currentProvider,
}: {
  titleId: string;
  titleName: string;
  choices: Choice[];
  currentProvider: ProviderId | null;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<ProviderId | null>(currentProvider);
  const [, startTransition] = useTransition();

  return (
    <section aria-labelledby="watch-source-heading" className="mt-5 rounded-lg border border-line bg-white/[0.02] p-4">
      <h3 id="watch-source-heading" className="text-sm font-semibold">Da dove lo stai guardando?</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">
        Scegli il servizio per ora. Quando l’estensione rileva la riproduzione, aggiorna automaticamente la scelta e il link preciso.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const active = selected === choice.id;
          return (
            <li key={choice.id}>
              <a
                href={choice.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setSelected(choice.id);
                  startTransition(async () => {
                    const result = await chooseWatchProvider(titleId, choice.id);
                    if (!result.ok) toast.show(result.error, { tone: "error" });
                    else toast.show(`${titleName}: servizio impostato su ${choice.name}`, { tone: "success" });
                  });
                }}
                aria-current={active ? "true" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-white/[0.06] ${active ? "border-white/50 bg-white/[0.07] text-fg" : "border-line-strong text-fg-2"}`}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: choice.tint }} />
                {choice.name}
                <ExternalLink aria-hidden className="size-3.5 text-fg-3" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
