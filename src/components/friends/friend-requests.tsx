"use client";

import { useTransition } from "react";
import { Check, X, UserRound, Clock3 } from "lucide-react";
import { respondFriendRequest } from "@/server/actions/friends";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { FriendRequest, PublicUser } from "@/domain/types";

type RequestView = { request: FriendRequest; user: PublicUser; direction: "incoming" | "outgoing" };

export function FriendRequests({ requests }: { requests: RequestView[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="friend-requests-heading">
      <h2 id="friend-requests-heading" className="text-[15px] font-semibold">Richieste di amicizia</h2>
      <ul className="mt-3 divide-y divide-line">
        {requests.map(({ request, user, direction }) => (
          <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-fg-2"><UserRound aria-hidden className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.displayName} <span className="font-normal text-fg-3">@{user.username}</span></span>
              <span className="block text-xs text-fg-3">{direction === "incoming" ? "Ti ha inviato una richiesta" : request.status === "pending" ? "Richiesta inviata · in attesa di risposta" : request.status === "accepted" ? "Richiesta accettata" : "Richiesta rifiutata"}</span>
            </span>
            {direction === "incoming" ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} icon={<Check aria-hidden className="size-4" />} onClick={() => startTransition(async () => {
                  const result = await respondFriendRequest(request.id, "accepted");
                  toast.show(result.ok ? "Richiesta accettata" : result.error, result.ok ? undefined : { tone: "error" });
                })}>Accetta</Button>
                <Button size="sm" variant="secondary" disabled={pending} icon={<X aria-hidden className="size-4" />} onClick={() => startTransition(async () => {
                  const result = await respondFriendRequest(request.id, "rejected");
                  toast.show(result.ok ? "Richiesta rifiutata" : result.error, result.ok ? undefined : { tone: "error" });
                })}>Rifiuta</Button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-3">{request.status === "pending" ? <><Clock3 aria-hidden className="size-3.5" />In attesa</> : request.status === "accepted" ? "Accettata" : "Rifiutata"}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
