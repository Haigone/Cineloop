import { Check } from "lucide-react";
import { OAUTH_LABELS, type OAuthProvider } from "@/domain/types";
import { buttonClasses } from "@/components/ui/button";
import { oauthHref, ProviderIcon } from "@/components/auth/provider-icon";

/**
 * Google / Discord in Impostazioni: which ones sign in to this account, and a
 * button to link the others. Hidden when none is configured on the site.
 * For a guest, linking one also registers the account with its email.
 */
export function LinkedAccounts({ options, linked, guest = false }: { options: OAuthProvider[]; linked: OAuthProvider[]; guest?: boolean }) {
  if (options.length === 0 && linked.length === 0) return null;
  const shown = [...new Set([...options, ...linked])];
  return (
    <div className={guest ? "mt-5" : "mb-6"}>
      <h3 className="mb-1 text-sm font-medium text-fg">Accesso con Google o Discord</h3>
      <p className="mb-3 max-w-[62ch] text-sm text-fg-2">
        {guest ? "Collegane uno per registrarti in un clic: resta tutto quello che hai salvato." : "Entra in CineLoop senza password con un account collegato."}
      </p>
      <ul className="flex flex-col gap-2">
        {shown.map((p) => (
          <li key={p} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
            <span className="flex items-center gap-2.5 text-sm text-fg">
              <ProviderIcon provider={p} />
              {OAUTH_LABELS[p]}
            </span>
            {linked.includes(p) ? (
              <span className="flex items-center gap-1.5 text-sm text-fg-2">
                <Check aria-hidden className="size-4" />
                Collegato
              </span>
            ) : (
              <a href={oauthHref(p, "/settings#account")} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Collega {OAUTH_LABELS[p]}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
