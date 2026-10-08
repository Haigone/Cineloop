import { DisabledAdapter } from "./base";

/**
 * Anime Unity. STATUS: not supported — stub only, by decision.
 *
 * Reviewed in docs/providers.md. Anime Unity is not an official distributor:
 * there is no evidence of licences from rights holders, no public API and no
 * terms that grant third-party access, and its domain changes often.
 * Integrating would mean sending users to unlicensed streams, so this adapter
 * intentionally does nothing. Anime stay fully trackable by hand, and licensed
 * services (Crunchyroll, Netflix, Prime Video) are the supported paths.
 */
export class AnimeUnityAdapter extends DisabledAdapter {
  constructor() {
    super("animeunity");
  }
}
