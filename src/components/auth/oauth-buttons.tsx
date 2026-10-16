import { configuredOAuthProviders } from "@/server/auth/oauth";
import { OAuthLinks } from "./oauth-links";

/**
 * "Continua con Google / Discord". Shows only the providers whose keys are set,
 * so with none configured nothing appears. Plain links: the browser leaves for
 * the provider's page and comes back signed in. Without `next`, the page's own
 * `?next=` is passed along.
 */
export function OAuthButtons({ next, divider = "oppure" }: { next?: string; divider?: string | null }) {
  const providers = configuredOAuthProviders();
  if (providers.length === 0) return null;
  return <OAuthLinks providers={providers} next={next} divider={divider} />;
}
