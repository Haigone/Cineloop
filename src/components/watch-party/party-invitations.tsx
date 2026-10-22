"use client";

import { useTransition } from "react";
import { Check, X, Popcorn } from "lucide-react";
import { respondWatchPartyInvitation } from "@/server/actions/watch-party";
import type { WatchPartyView } from "@/server/services/watch-party";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function PartyInvitations({ invitations }: { invitations: WatchPartyView["invitations"] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  if (invitations.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-violet/40 bg-surface p-5" aria-labelledby="party-invitations-heading">
      <h2 id="party-invitations-heading" className="text-[15px] font-semibold">Inviti alle serate</h2>
      <ul className="mt-3 divide-y divide-line">
        {invitations.map(({ invitation, title, host }) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-violet/10 text-violet"><Popcorn aria-hidden className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{host.displayName} ti invita a una serata</span>
              <span className="block text-xs text-fg-3">{title?.title ?? "Titolo non disponibile"} · La partecipazione è in attesa della tua risposta</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} icon={<Check aria-hidden className="size-4" />} onClick={() => startTransition(async () => {
                const result = await respondWatchPartyInvitation(invitation.id, "accepted");
                toast.show(result.ok ? "Invito accettato" : result.error, result.ok ? undefined : { tone: "error" });
              })}>Accetta</Button>
              <Button size="sm" variant="secondary" disabled={pending} icon={<X aria-hidden className="size-4" />} onClick={() => startTransition(async () => {
                const result = await respondWatchPartyInvitation(invitation.id, "rejected");
                toast.show(result.ok ? "Invito rifiutato" : result.error, result.ok ? undefined : { tone: "error" });
              })}>Rifiuta</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
