"use client";

import { useState, useTransition } from "react";
import { Send, Users } from "lucide-react";
import type { PublicUser } from "@/domain/types";
import { suggestTitle } from "@/server/actions/suggest";
import { firstName } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * "Consiglia a un amico": pick friends, and the title lands on their wishlist
 * with your name on it. Friends who already have it are shown as such.
 */
export function SuggestDialog({
  titleId,
  titleName,
  friends,
  alreadyHave,
}: {
  titleId: string;
  titleName: string;
  friends: PublicUser[];
  alreadyHave: string[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const have = new Set(alreadyHave);

  function send() {
    const ids = [...picked];
    startTransition(async () => {
      const res = await suggestTitle(titleId, ids);
      if (res.ok) {
        const names = friends.filter((f) => picked.has(f.id)).map((f) => firstName(f.displayName));
        toast.show(names.length === 1 ? `Consigliato a ${names[0]}` : `Consigliato a ${names.length} amici`);
        setPicked(new Set());
        setOpen(false);
      } else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <>
      <Button variant="secondary" size="lg" icon={<Send aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
        Consiglia a un amico
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Consiglia a un amico"
        description={`${titleName} finisce nella loro wishlist, con il tuo nome.`}
      >
        {friends.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="flex items-center gap-2 text-sm text-fg-2">
              <Users aria-hidden className="size-4 text-fg-3" />
              Non hai ancora amici su CineLoop.
            </p>
            <ButtonLink href="/friends" variant="secondary" size="sm">
              Trova amici
            </ButtonLink>
          </div>
        ) : (
          <>
            <ul className="-mx-1 max-h-72 overflow-y-auto">
              {friends.map((friend) => {
                const has = have.has(friend.id);
                const checked = picked.has(friend.id);
                return (
                  <li key={friend.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-white/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent ${has ? "opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={checked}
                        disabled={has}
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
                        <span className="block truncate text-xs text-fg-3">{has ? "Ce l'ha già in lista" : `@${friend.username}`}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button onClick={send} loading={pending} disabled={picked.size === 0}>
                {picked.size > 1 ? `Consiglia a ${picked.size} amici` : "Consiglia"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
