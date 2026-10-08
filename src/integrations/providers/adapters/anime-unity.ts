import { DisabledAdapter } from "./base";

/**
 * Anime Unity. STATUS: under review — no integration.
 *
 * Anime Unity is not a licensed distributor and has no official API or
 * terms that grant third-party access; its domain changes frequently.
 * Integrating with it could mean directing users to unlicensed streams, so
 * CineLoop keeps this adapter disabled. Users can still track anime manually,
 * and licensed alternatives (Crunchyroll, Netflix) are supported instead.
 */
export class AnimeUnityAdapter extends DisabledAdapter {
  constructor() {
    super("animeunity");
  }
}
