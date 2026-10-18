"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { RatingValue, WatchStatus } from "@/domain/types";
import { rateTitle, setStatus } from "@/server/actions/library";
import { RatingInput } from "@/components/ui/rating";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { WishlistButton } from "@/components/media/wishlist-button";

type StatusChoice = "none" | "watching" | "completed";

/** Plans are the wishlist's job, so the library only knows started and finished. */
const OPTIONS: { value: StatusChoice; label: string }[] = [
  { value: "none", label: "Non in libreria" },
  { value: "watching", label: "In corso" },
  { value: "completed", label: "Visto" },
];

interface Props {
  titleId: string;
  titleName: string;
  status: WatchStatus | null;
  rating: RatingValue | null;
  wishlisted: boolean;
  rezeroVersion: "directors-cut" | "2016" | null;
}

export function TitleActions({ titleId, titleName, status, rating, wishlisted, rezeroVersion }: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<StatusChoice>(
    status === "watching" || status === "completed" ? status : "none",
  );
  const [optimisticRating, setOptimisticRating] = useOptimistic(rating);
  const isReZero = /re\s*:?\s*zero/i.test(titleName);
  const [pendingStatus, setPendingStatus] = useState<StatusChoice | null>(null);
  const [pendingVersion, setPendingVersion] = useState<"directors-cut" | "2016" | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[13px] text-fg-3">Nella tua libreria</p>
        <Segmented
          label={`Stato di ${titleName} nella libreria`}
          options={OPTIONS.filter((o) => o.value !== "none" || optimisticStatus === "none")}
          value={optimisticStatus}
          onChange={(next) => {
            if (next === "none") return;
            if (isReZero && !rezeroVersion) {
              setPendingStatus(next);
              setPendingVersion(null);
              return;
            }
            startTransition(async () => {
              setOptimisticStatus(next);
              const res = await setStatus(titleId, next);
              toast.show(res.ok ? `${titleName}: ${OPTIONS.find((o) => o.value === next)!.label.toLowerCase()}` : res.error, {
                tone: res.ok ? "success" : "error",
              });
            });
          }}
          className="rounded-lg border border-line bg-white/[0.02] p-1 md:mx-0"
        />
      </div>
      {pendingStatus && isReZero && (
        <div role="dialog" aria-labelledby="rezero-choice-title" className="rounded-xl border border-line bg-surface p-4">
          <h3 id="rezero-choice-title" className="text-sm font-semibold">Quale prima stagione di Re:Zero vuoi vedere?</h3>
          <div className="mt-3 grid gap-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3">
              <input type="radio" name="rezero-version" checked={pendingVersion === "directors-cut"} onChange={() => setPendingVersion("directors-cut")} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">Director’s Cut (2019)</span>
                <span className="mt-1 block text-xs text-fg-3">13 episodi più lunghi: rimonta i 25 episodi del 2016 in puntate estese e include alcune scene aggiuntive. È il modo più compatto di rivedere la prima stagione.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3">
              <input type="radio" name="rezero-version" checked={pendingVersion === "2016"} onChange={() => setPendingVersion("2016")} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">Versione originale (2016)</span>
                <span className="mt-1 block text-xs text-fg-3">25 episodi nel formato originale, con il montaggio e il ritmo della prima trasmissione.</span>
              </span>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => { setPendingStatus(null); setPendingVersion(null); }}>Annulla</button>
            <button
              type="button"
              disabled={!pendingVersion}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => {
                if (!pendingStatus || !pendingVersion) return;
                const next = pendingStatus;
                const version = pendingVersion;
                setPendingStatus(null);
                startTransition(async () => {
                  setOptimisticStatus(next);
                  const res = await setStatus(titleId, next, version);
                  toast.show(res.ok ? `${titleName}: scelta di visione salvata` : res.error, { tone: res.ok ? "success" : "error" });
                });
              }}
            >Conferma scelta</button>
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-[13px] text-fg-3">Il tuo voto</p>
        <RatingInput
          label={`Il tuo voto per ${titleName}`}
          value={optimisticRating}
          onChange={(value) =>
            startTransition(async () => {
              setOptimisticRating(value);
              const res = await rateTitle(titleId, value);
              if (!res.ok) toast.show(res.error, { tone: "error" });
              else toast.show(value ? `Voto salvato: ${(value / 2).toLocaleString("it-IT")} su 5` : "Voto rimosso");
            })
          }
        />
      </div>
      {optimisticStatus !== "completed" && optimisticStatus !== "watching" && (
        <WishlistButton titleId={titleId} titleName={titleName} wishlisted={wishlisted} appearance="button" className="self-start" />
      )}
    </div>
  );
}
