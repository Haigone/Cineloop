"use client";

import { useTransition } from "react";
import { setTitleUpdates } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** On a series taken out of Novità with the X: says what is left and puts it back. */
export function NewsRestore({ titleId, titleName, updates }: { titleId: string; titleName: string; updates: "releaseDay" | "none" }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
      {updates === "releaseDay" ? "Non è più nelle Novità: ti avvisiamo solo il giorno in cui esce una stagione o un episodio." : "Non è più nelle Novità e non ricevi aggiornamenti."}
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setTitleUpdates(titleId, "all");
            toast.show(res.ok ? `${titleName} torna nelle Novità` : res.error, { tone: res.ok ? "success" : "error" });
          })
        }
      >
        Rimetti nelle Novità
      </Button>
    </p>
  );
}
