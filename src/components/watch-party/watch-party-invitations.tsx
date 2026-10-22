"use client";

import { useState, useTransition } from "react";
import { Check, Clock3, X } from "lucide-react";
import type { WatchPartyView } from "@/server/services/watch-party";
import { respondToWatchPartyInvitation } from "@/server/actions/watch-party";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Invitation = WatchPartyView["invitations"][number];

export function WatchPartyInvitations({ invitations: initial }: { invitations: Invitation[] }) {
  const [invitations, setInvitations] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (invitations.length === 0) return null;

  function respond(partyId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondToWatchPartyInvitation(partyId, accept);
      if (!result.ok) {
        toast.show(result.error, { tone: "error" });
        return;
      }
      setInvitations((current) => current.filter((item) => item.party.id !== partyId));
      toast.show(accept ? "Invito accettato" : "Invito rifiutato", { tone: "success" });
    });
  }

  return (
    <section aria-labelledby="watch-party-invitations" className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <h2 id="watch-party-invitations" className="flex items-center gap-2 font-semibold">
        <Clock3 aria-hidden className="size-4" /> Inviti alle serate
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{invitations.length}</span>
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {invitations.map(({ party, title, hostName }) => (
          <li key={party.id} className="rounded-xl border border-line p-4">
            <p className="text-xs text-fg-2">{hostName} ti invita a guardare insieme</p>
            <h3 className="mt-1 font-semibold">{title.title}</h3>
            <p className="mt-1 text-xs text-fg-2">
              {party.status === "scheduled" && party.scheduledFor
                ? new Date(party.scheduledFor).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })
                : party.status === "queued" ? "Dopo le serate in corso" : "La serata è già iniziata"}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={pending} disabled={pending} onClick={() => respond(party.id, true)} icon={<Check aria-hidden className="size-4" />}>
                Accetta
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => respond(party.id, false)} icon={<X aria-hidden className="size-4" />}>
                Rifiuta
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
