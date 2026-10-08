"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Users } from "lucide-react";
import { PROVIDERS } from "@/domain/providers";
import type { LiveFriend } from "@/server/services/sync";
import { joinWatching } from "@/server/actions/extension";
import { episodeLabel, firstName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * Friends watching right now (reported by their CineLoop extension), each
 * with "Unisciti": open the same thing on the provider and, when the host
 * shared one, their watch-together room.
 */
export function LiveFriends({ items }: { items: LiveFriend[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <LiveRow key={item.user.id} item={item} />
      ))}
    </ul>
  );
}

function LiveRow({ item }: { item: LiveFriend }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(item.joined);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const what = item.title?.title ?? item.label ?? "qualcosa";
  const provider = PROVIDERS[item.providerId].name;
  const ep = episodeLabel(item, "short");
  const name = firstName(item.user.displayName);

  function join() {
    if (joined) return setOpen(true);
    startTransition(async () => {
      const res = await joinWatching(item.user.id);
      if (res.ok) {
        setJoined(true);
        setOpen(true);
      } else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <li className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5">
      <Avatar user={item.user} size="md" live decorative />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-fg">{name}</span>
          <span className="shrink-0 text-[11px] text-accent-hover">In diretta</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-fg-2">
          Sta guardando {what} su {provider}
        </span>
        {(ep || item.guestCount > 0) && (
          <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-3 tabular">
            {ep}
            {item.guestCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden className="size-3" />
                {item.guestCount === 1 ? "con 1 amico" : `con ${item.guestCount} amici`}
              </span>
            )}
          </span>
        )}
      </span>
      <Button size="sm" variant={joined ? "secondary" : "primary"} loading={pending} onClick={join} aria-label={`${joined ? "Riapri" : "Unisciti"}: ${name}, ${what}`}>
        {joined ? "Riapri" : "Unisciti"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Guarda con ${name}`}
        description={`${name} sa che ti sei unito. Apri ${what} su ${provider} dal tuo account.`}
      >
        <div className="flex flex-col gap-3">
          {item.partyUrl && (
            <ButtonAnchor href={item.partyUrl} size="lg" icon={<Users aria-hidden className="size-4" />}>
              Entra nella stanza di {name}{" "}
              <span className="text-white/70">({new URL(item.partyUrl).hostname.replace(/^www\./, "")})</span>
            </ButtonAnchor>
          )}
          <ButtonAnchor href={item.url} variant={item.partyUrl ? "secondary" : "primary"} size="lg" icon={<ExternalLink aria-hidden className="size-4" />}>
            Apri su {provider}
          </ButtonAnchor>
          <p className="text-[13px] leading-relaxed text-fg-3">
            {item.partyUrl
              ? "La stanza tiene play, pausa e posizione allineati per tutti."
              : `Per restare in sincrono, ${name} può creare una stanza con un'estensione watch party (per esempio Teleparty) e condividerne il link dal pannello di CineLoop: comparirà qui.`}
          </p>
        </div>
      </Modal>
    </li>
  );
}
