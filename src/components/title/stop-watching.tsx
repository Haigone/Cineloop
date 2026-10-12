"use client";

import { useState, useTransition } from "react";
import { Bookmark, Trash2, Undo2 } from "lucide-react";
import { stopWatching } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";

/** For a title marked "in corso" by mistake: back to the wishlist, or out of the library. */
export function StopWatching({ titleId, titleName }: { titleId: string; titleName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function act(close: () => void, destination: "wishlist" | "remove", done: string) {
    startTransition(async () => {
      const res = await stopWatching(titleId, destination);
      close();
      toast.show(res.ok ? done : (res.error ?? "Qualcosa non ha funzionato."), { tone: res.ok ? "success" : "error" });
    });
  }

  return (
    <Popover
      label={`Togli ${titleName} da In corso`}
      className="w-64"
      onOpenChange={(open) => !open && setConfirming(false)}
      trigger={({ ref, ...props }) => (
        <Button ref={ref} {...props} variant="ghost" size="sm" icon={<Undo2 aria-hidden className="size-3.5" />}>
          Non lo sto guardando
        </Button>
      )}
    >
      {(close) =>
        confirming ? (
          <div className="p-3">
            <p className="text-sm text-fg">Togliere {titleName} dalla libreria?</p>
            <p className="mt-1 text-xs text-fg-3">Perdi dove eri arrivato e il tuo voto.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Annulla
              </Button>
              <Button variant="danger" size="sm" loading={pending} onClick={() => act(close, "remove", `${titleName} tolto dalla libreria`)}>
                Togli
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(close, "wishlist", `${titleName} è tornato in wishlist`)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg disabled:opacity-50"
            >
              <Bookmark aria-hidden className="size-4" />
              Sposta in wishlist
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-accent"
            >
              <Trash2 aria-hidden className="size-4" />
              Togli dalla libreria
            </button>
          </div>
        )
      }
    </Popover>
  );
}
