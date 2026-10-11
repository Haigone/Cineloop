"use client";

import { useTransition } from "react";
import { FastForward } from "lucide-react";
import type { FillerRun } from "@/domain/watch-order";
import { skipFillers } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Tells that the next episodes are filler, and moves the viewer's place to the first one after them. */
export function FillerNotice({ titleId, titleName, run }: { titleId: string; titleName: string; run: FillerRun }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const range = run.from === run.to ? `L’episodio ${run.from}` : `Gli episodi ${run.from}–${run.to}`;
  const verb = run.from === run.to ? "è un filler" : "sono filler";

  return (
    <div role="note" className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm">
      <p className="min-w-0 text-fg">
        <span className="font-medium text-accent">Filler in arrivo.</span> {range} {verb}
        {run.after === null && ", fino alla fine della stagione"}.
      </p>
      {run.after !== null && (
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await skipFillers(titleId);
              toast.show(res.ok ? `${titleName}: ora sei all’episodio ${run.after}` : (res.error ?? "Qualcosa non ha funzionato."), { tone: res.ok ? "success" : "error" });
            })
          }
        >
          <FastForward aria-hidden className="size-3.5" />
          Salta i filler · vai all’episodio {run.after}
        </Button>
      )}
    </div>
  );
}
