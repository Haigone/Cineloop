"use client";

import { useState, useTransition } from "react";
import { Check, UserRoundX, Users } from "lucide-react";
import type { FriendRequest } from "@/domain/types";
import { respondToFriendRequest } from "@/server/actions/friends";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function FriendRequests({ requests: initial }: { requests: FriendRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (requests.length === 0) return null;

  function respond(requesterId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondToFriendRequest(requesterId, accept);
      if (!result.ok) {
        toast.show(result.error, { tone: "error" });
        return;
      }
      setRequests((current) => current.filter((request) => request.user.id !== requesterId));
      toast.show(accept ? "Richiesta accettata" : "Richiesta rifiutata", { tone: "success" });
    });
  }

  return (
    <section aria-labelledby="friend-requests-heading" className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <h2 id="friend-requests-heading" className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="size-4" /> Richieste di amicizia
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{requests.length}</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {requests.map(({ user, requestedAt }) => (
          <li key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white/10 text-sm font-semibold">
                {user.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.displayName}</span>
              <span className="block text-xs text-fg-2">@{user.username} · {new Date(requestedAt).toLocaleDateString("it-IT")}</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" loading={pending} disabled={pending} onClick={() => respond(user.id, true)} icon={<Check aria-hidden className="size-4" />}>
                Accetta
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => respond(user.id, false)} icon={<UserRoundX aria-hidden className="size-4" />}>
                Rifiuta
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
