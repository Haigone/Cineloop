"use client";

import { useState, useTransition } from "react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import { setCollectionFollowed } from "@/server/actions/collections";
import { useToast } from "@/components/ui/toast";

export function FollowCollectionButton({ collectionId, initialFollowed }: { collectionId: string; initialFollowed: boolean }) {
  const [followed, setFollowed] = useState(initialFollowed);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => {
    const next = !followed;
    const result = await setCollectionFollowed(collectionId, next);
    if (result.ok) { setFollowed(next); toast.show(next ? "Collezione aggiunta alla tua libreria" : "Collezione rimossa dalla tua libreria", { tone: "success" }); }
    else toast.show(result.error, { tone: "error" });
  })} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15 disabled:opacity-50">
    {followed ? <BookmarkCheck className="size-4" /> : <BookmarkPlus className="size-4" />}{pending ? "Salvataggio…" : followed ? "Non seguire collezione" : "Segui collezione"}
  </button>;
}
