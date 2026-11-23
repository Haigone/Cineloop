"use client";

import { useTransition } from "react";
import type { Title, WatchProgress } from "@/domain/types";
import { respondToCompletionPrompt } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { KeyArt } from "@/components/media/key-art";
import { useToast } from "@/components/ui/toast";

type Prompt = NonNullable<WatchProgress["completionPrompt"]>;

/** Asks for an explicit confirmation when the player reaches its final five minutes. */
export function CompletionPrompt({ title, prompt }: { title: Title; prompt: Prompt }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const remainingLabel = prompt.remainingSeconds < 60
    ? "meno di un minuto"
    : `circa ${Math.ceil(prompt.remainingSeconds / 60)} minuti`;

  function answer(finished: boolean) {
    startTransition(async () => {
      const result = await respondToCompletionPrompt(title.id, finished);
      if (!result.ok) {
        toast.show(result.error, { tone: "error" });
        return;
      }
      toast.show(
        finished
          ? title.type === "movie" ? "Film segnato come visto" : "Episodio completato: avanzamento aggiornato"
          : "Va bene, continuiamo a tenerne traccia",
        { tone: "success" },
      );
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-prompt-title"
        aria-describedby="completion-prompt-description"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-center gap-4">
          <KeyArt title={title} variant="poster" sizes="64px" className="aspect-[2/3] w-16 shrink-0 rounded-lg border border-line" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">CineLoop · Fine visione</p>
            <h2 id="completion-prompt-title" className="mt-1 text-xl font-semibold text-fg">Hai finito?</h2>
            <p className="mt-1 text-sm text-fg-2">{title.title}</p>
          </div>
        </div>
        <p id="completion-prompt-description" className="mt-5 text-sm leading-relaxed text-fg-2">
          {title.type === "movie"
            ? `Il player segnala che mancano ${remainingLabel}. Hai terminato il film?`
            : `Il player segnala che mancano ${remainingLabel}. Hai terminato questo episodio? Se confermi, CineLoop passerà al prossimo.`}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => answer(false)} disabled={pending}>
            Non ancora
          </Button>
          <Button onClick={() => answer(true)} disabled={pending}>
            Sì, ho finito
          </Button>
        </div>
      </section>
    </div>
  );
}
