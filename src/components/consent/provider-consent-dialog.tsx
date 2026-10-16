"use client";

import { useState, useTransition } from "react";
import type { ConsentProvider } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { setProviderConsent } from "@/server/actions/settings";
import { PROVIDER_NOTICE, PROVIDER_NOTICE_FOOTER } from "./provider-notice";

/**
 * Shown once, the first time the extension meets AnimeUnity or StreamingCommunity.
 * Closing it without choosing keeps the question open for the next visit.
 */
export function ProviderConsentDialog({ provider }: { provider: ConsentProvider }) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const notice = PROVIDER_NOTICE[provider];

  function answer(accepted: boolean) {
    startTransition(async () => {
      const res = await setProviderConsent({ provider, accepted });
      if (res.ok) setOpen(false);
      else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`Attivare ${notice.name}?`}
      description={`L’estensione ha visto che stai guardando su ${notice.name}.`}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={() => answer(false)}>
            No, grazie
          </Button>
          <Button disabled={pending} onClick={() => answer(true)}>
            Attiva {notice.name}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-fg-2">
        <p className="text-fg">{notice.lead}</p>
        <p>{notice.detail}</p>
        <p>{PROVIDER_NOTICE_FOOTER}</p>
      </div>
    </Modal>
  );
}
