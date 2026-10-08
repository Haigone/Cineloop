"use client";

import type { Provider, ProviderId } from "@/domain/types";
import { INTEGRATION_LABEL } from "@/domain/providers";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { usePreference } from "./use-preference";

const STATUS_NOTE: Record<Provider["integration"], string> = {
  available: "Sincronizzazione attiva.",
  planned: "Sincronizzazione non ancora disponibile. Puoi aprire i titoli sul servizio.",
  "under-review": "Stiamo verificando se esiste un modo consentito per sincronizzare.",
  "not-supported": "Non supportato.",
};

/**
 * "I servizi che usi": a plain list the user maintains by hand. Marking a
 * service never connects to it; it only helps rank suggestions.
 */
export function SubscriptionList({ providers, initial }: { providers: Provider[]; initial: ProviderId[] }) {
  const [value, set] = usePreference("subscriptions", initial);
  return (
    <ul className="divide-y divide-line">
      {providers.map((p) => {
        const on = value.includes(p.id);
        const selectable = p.homepage !== null;
        const labelId = `sub-${p.id}`;
        return (
          <li key={p.id} className="flex items-center gap-4 py-3.5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: p.tint }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span id={labelId} className="text-sm text-fg">
                  {p.name}
                </span>
                <span
                  className={cn(
                    "rounded-sm border px-1.5 py-px text-[11px]",
                    p.integration === "under-review" ? "border-violet/30 text-violet" : "border-line-strong text-fg-3",
                  )}
                >
                  {INTEGRATION_LABEL[p.integration]}
                </span>
              </p>
              <p id={`${labelId}-desc`} className="mt-0.5 text-[13px] text-fg-3">
                {selectable ? STATUS_NOTE[p.integration] : "Servizio senza licenze verificate: CineLoop non si integra e non rimanda a questo sito. Puoi comunque tracciare i titoli a mano."}
              </p>
            </div>
            {selectable && (
              <Switch
                checked={on}
                onChange={(next) => set(next ? [...value, p.id] : value.filter((id) => id !== p.id))}
                labelledBy={labelId}
                describedBy={`${labelId}-desc`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
