"use client";

import { useOptimistic, useTransition } from "react";
import type { RatingValue, WatchStatus } from "@/domain/types";
import { rateTitle, setStatus } from "@/server/actions/library";
import { RatingInput } from "@/components/ui/rating";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { WishlistButton } from "@/components/media/wishlist-button";

type StatusChoice = "none" | "planned" | "watching" | "completed";

const OPTIONS: { value: StatusChoice; label: string }[] = [
  { value: "none", label: "Non in libreria" },
  { value: "planned", label: "Da vedere" },
  { value: "watching", label: "In corso" },
  { value: "completed", label: "Visto" },
];

interface Props {
  titleId: string;
  titleName: string;
  status: WatchStatus | null;
  rating: RatingValue | null;
  wishlisted: boolean;
}

export function TitleActions({ titleId, titleName, status, rating, wishlisted }: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<StatusChoice>(
    status === "dropped" || status === null ? "none" : status,
  );
  const [optimisticRating, setOptimisticRating] = useOptimistic(rating);

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
