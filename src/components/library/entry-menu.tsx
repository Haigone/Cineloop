"use client";

import { useState, useTransition } from "react";
import { CheckCheck, MoreHorizontal, Trash2 } from "lucide-react";
import type { LibraryEntry, Title } from "@/domain/types";
import { finishTitle, removeFromLibrary } from "@/server/actions/library";
import { Popover } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** A library card's actions: mark an in-progress title as seen, or take it out of the library. */
export function EntryMenu({ title, entry }: { title: Title; entry: LibraryEntry }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const seen = title.type === "movie" ? "Segna come visto" : "Segna come vista";

  function act(close: () => void, run: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const res = await run();
      close();
      toast.show(res.ok ? done : (res.error ?? "Qualcosa non ha funzionato."), { tone: res.ok ? "success" : "error" });
    });
  }

  return (
    <Popover
      label={`Azioni per ${title.title}`}
      className="w-60"
      onOpenChange={(open) => !open && setConfirming(false)}
      trigger={({ ref, ...props }) => (
        <button
          ref={ref}
          type="button"
          aria-label={`Azioni per ${title.title}`}
          {...props}
          className="grid size-8 place-items-center rounded-full border border-white/10 bg-black/60 text-fg backdrop-blur-md transition-opacity hover:bg-black/80"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
      )}
    >
      {(close) =>
        confirming ? (
          <div className="p-3">
            <p className="text-sm text-fg">Rimuovere {title.title} dalla libreria?</p>
            <p className="mt-1 text-xs text-fg-3">Perdi dove eri arrivato e il tuo voto.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Annulla
              </Button>
              <Button variant="danger" size="sm" loading={pending} onClick={() => act(close, () => removeFromLibrary(title.id), `${title.title} rimosso dalla libreria`)}>
                Rimuovi
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-1.5">
            {entry.status === "watching" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(close, () => finishTitle(title.id), `${title.title}: segnato come visto`)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg disabled:opacity-50"
              >
                <CheckCheck aria-hidden className="size-4" />
                {seen}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-accent"
            >
              <Trash2 aria-hidden className="size-4" />
              Rimuovi dalla libreria
            </button>
          </div>
        )
      }
    </Popover>
  );
}
