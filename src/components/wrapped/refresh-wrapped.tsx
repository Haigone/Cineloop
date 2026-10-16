"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reads the library again: after an import from the extension, the page may still show the earlier numbers. */
export function RefreshWrapped() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
      <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
      {pending ? "Aggiorno…" : "Aggiorna il Wrapped"}
    </Button>
  );
}
