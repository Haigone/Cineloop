"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import type { Title } from "@/domain/types";
import { removeFromLibrary } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";

/** Takes a title out of the history on Home. It is the library entry that goes: progress and rating with it. */
export function RecentRemove({ title }: { title: Title }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Popover
      label={`Togli ${title.title} dallo storico`}
      className="w-64"
      trigger={({ ref, ...props }) => (
        <button
          ref={ref}
          type="button"
          aria-label={`Togli ${title.title} dallo storico`}
          {...props}
          className="grid size-7 place-items-center rounded-full text-fg-3 transition-colors hover:bg-white/10 hover:text-fg"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-3">
          <p className="text-sm text-fg">Togliere {title.title} dallo storico?</p>
          <p className="mt-1 text-xs text-fg-3">Esce anche dalla libreria: perdi dove eri arrivato e il tuo voto.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Annulla
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeFromLibrary(title.id);
                  close();
                  toast.show(res.ok ? `${title.title} tolto dallo storico` : (res.error ?? "Qualcosa non ha funzionato."), { tone: res.ok ? "success" : "error" });
                })
              }
            >
              Togli
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
