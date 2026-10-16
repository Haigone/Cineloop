"use client";

import { useId, useState, useTransition } from "react";
import { CONSENT_PROVIDERS, type ConsentProvider, type ConsentState } from "@/domain/types";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { setProviderConsent } from "@/server/actions/settings";
import { PROVIDER_NOTICE, PROVIDER_NOTICE_FOOTER } from "./provider-notice";

/** Impostazioni: i siti non ufficiali che l’estensione legge solo se li accendi tu. */
export function ProviderConsentSwitches({ initial }: { initial: Partial<Record<ConsentProvider, ConsentState>> }) {
  return (
    <div className="divide-y divide-line">
      {CONSENT_PROVIDERS.map((id) => (
        <ConsentRow key={id} provider={id} initial={initial[id] === "accepted"} />
      ))}
      <p className="py-4 text-[13px] text-fg-3">{PROVIDER_NOTICE_FOOTER}</p>
    </div>
  );
}

function ConsentRow({ provider, initial }: { provider: ConsentProvider; initial: boolean }) {
  const id = useId();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const notice = PROVIDER_NOTICE[provider];

  function change(next: boolean) {
    const previous = on;
    setOn(next);
    startTransition(async () => {
      const res = await setProviderConsent({ provider, accepted: next });
      if (!res.ok) {
        setOn(previous);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm text-fg">
          {notice.name}
        </p>
        <p id={`${id}-desc`} className="mt-0.5 max-w-[56ch] text-[13px] text-fg-3">
          {notice.lead} {notice.detail}
        </p>
      </div>
      <Switch checked={on} onChange={change} labelledBy={`${id}-label`} describedBy={`${id}-desc`} disabled={pending} className="mt-0.5" />
    </div>
  );
}
