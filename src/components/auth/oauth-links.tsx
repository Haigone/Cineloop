"use client";

import { useSearchParams } from "next/navigation";
import { OAUTH_LABELS, type OAuthProvider } from "@/domain/types";
import { buttonClasses } from "@/components/ui/button";
import { oauthHref, ProviderIcon } from "./provider-icon";

export function OAuthLinks({ providers, next, divider }: { providers: OAuthProvider[]; next?: string; divider: string | null }) {
  const fromPage = useSearchParams().get("next");
  const target = next ?? fromPage ?? undefined;
  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <a key={p} href={oauthHref(p, target)} className={buttonClasses({ variant: "secondary", size: "lg", className: "w-full" })}>
          <ProviderIcon provider={p} />
          Continua con {OAUTH_LABELS[p]}
        </a>
      ))}
      {divider && (
        <div className="my-2 flex items-center gap-3 text-xs text-fg-3">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span>{divider}</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
      )}
    </div>
  );
}
