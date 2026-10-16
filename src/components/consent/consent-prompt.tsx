import { CONSENT_PROVIDERS } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ProviderConsentDialog } from "./provider-consent-dialog";

/** The notice for the first service the extension met that the user has not answered yet. */
export async function ConsentPrompt() {
  const user = await getCurrentUser();
  const { providerConsent } = await getRepository().getPreferences(user.id);
  const pending = CONSENT_PROVIDERS.find((id) => providerConsent[id] === "pending");
  return pending ? <ProviderConsentDialog key={pending} provider={pending} /> : null;
}
