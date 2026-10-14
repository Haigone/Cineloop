"use client";

import { useState, useTransition } from "react";
import { LogOut, UserPlus, Users } from "lucide-react";
import type { PublicUser } from "@/domain/types";
import { inviteToSharedWatch, leaveSharedWatch, startSharedWatch } from "@/server/actions/shared-watch";
import { joinNames } from "@/domain/shared-watch";
import { firstName } from "@/lib/format";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface Together {
  id: string;
  others: PublicUser[];
  updatedBy: string | null;
}

/**
 * "Serata insieme" on a series or anime: watch it with friends and share one
 * place. Outside a group it starts one; inside, it shows who is in it and lets
 * the viewer bring more friends or leave.
 */
export function SharedWatchPanel({ titleId, titleName, friends, together }: { titleId: string; titleName: string; friends: PublicUser[]; together: Together | null }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const inGroup = new Set(together?.others.map((u) => u.id) ?? []);
  const choices = friends.filter((f) => !inGroup.has(f.id));

  function confirm() {
    const ids = [...picked];
    const names = joinNames(friends.filter((f) => picked.has(f.id)).map((f) => firstName(f.displayName)));
    startTransition(async () => {
      const res = together ? await inviteToSharedWatch(together.id, ids) : await startSharedWatch(titleId, ids);
      if (res.ok) {
        toast.show(together ? `${names} ora è nella serata` : `Serata insieme con ${names}: i progressi sono condivisi`);
        setPicked(new Set());
        setOpen(false);
      } else toast.show(res.error, { tone: "error" });
    });
  }

  function leave() {
    if (!together) return;
    startTransition(async () => {
      const res = await leaveSharedWatch(together.id);
      if (res.ok) toast.show(`Sei uscito dalla serata di ${titleName}: il tuo punto resta, ma non si aggiorna più con gli altri`);
      else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <>
      {together ? (
        <div className="rounded-lg border border-violet/55 bg-violet/[0.07] p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-violet">
            <Users aria-hidden className="size-4" />
            Serata insieme
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <AvatarStack users={together.others} max={4} size="xs" />
            <p className="min-w-0 text-[13px] text-fg-2">Con {joinNames(together.others.map((u) => firstName(u.displayName)))}</p>
          </div>
          <p className="mt-2 text-xs text-fg-3">
            Il punto in cui siete arrivati è condiviso: se uno va avanti, si aggiorna per tutti.
            {together.updatedBy && ` Ultimo aggiornamento di ${together.updatedBy}.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.length > 0 && (
              <Button size="sm" variant="secondary" icon={<UserPlus aria-hidden className="size-3.5" />} onClick={() => setOpen(true)}>
                Invita amici
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={pending && !open} icon={<LogOut aria-hidden className="size-3.5" />} onClick={leave}>
              Esci dalla serata
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="lg" className="w-full" icon={<Users aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
          Guardala insieme
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={together ? "Invita alla serata insieme" : "Serata insieme"}
        description={`Scegli con chi guardi ${titleName}: finisce nelle vostre Home sotto “Serate insieme” e, quando uno di voi va avanti, il punto si aggiorna per tutti.`}
      >
        {choices.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="flex items-center gap-2 text-sm text-fg-2">
              <Users aria-hidden className="size-4 text-fg-3" />
              {friends.length === 0 ? "Non hai ancora amici su CineLoop." : "I tuoi amici sono già tutti nella serata."}
            </p>
            {friends.length === 0 && (
              <ButtonLink href="/friends" variant="secondary" size="sm">
                Trova amici
              </ButtonLink>
            )}
          </div>
        ) : (
          <>
            <ul className="-mx-1 max-h-72 overflow-y-auto">
              {choices.map((friend) => (
                <li key={friend.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-violet)]"
                      checked={picked.has(friend.id)}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(friend.id);
                          else next.delete(friend.id);
                          return next;
                        })
                      }
                    />
                    <Avatar user={friend} size="sm" decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{friend.displayName}</span>
                      <span className="block truncate text-xs text-fg-3">@{friend.username}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {!together && <p className="mt-3 text-xs text-fg-3">Si parte dal punto in cui sei arrivato tu.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button onClick={confirm} loading={pending} disabled={picked.size === 0}>
                {together ? "Invita" : "Guardatela insieme"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
