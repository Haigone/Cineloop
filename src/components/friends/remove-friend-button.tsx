"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFriend } from "@/server/actions/friends";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Destructive action behind a confirmation that names the person. */
export function RemoveFriendButton({ friendId, name }: { friendId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Rimuovi dagli amici
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Rimuovere ${name} dagli amici?`}
        description="Non vedrete più le attività l'uno dell'altro. Potrete aggiungervi di nuovo in qualsiasi momento."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeFriend(friendId);
                  if (res.ok) {
                    toast.show(`${name} rimosso dagli amici`);
                    router.push("/friends");
                  } else toast.show(res.error, { tone: "error" });
                })
              }
            >
              Rimuovi {name}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">I vostri voti e le vostre liste restano invariati.</p>
      </Modal>
    </>
  );
}
