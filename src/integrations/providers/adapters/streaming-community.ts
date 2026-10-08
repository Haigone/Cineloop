import { DisabledAdapter } from "./base";

/**
 * Streaming Community. STATUS: not supported — stub only, by decision.
 *
 * Reviewed in docs/providers.md. Italian press reports describe it as a
 * pirate site that is repeatedly blocked, with the Guardia di Finanza
 * redirecting visitors to a warning page and fining users. CineLoop does not
 * detect, link to or otherwise integrate with it. Manual tracking keeps
 * working for any title.
 */
export class StreamingCommunityAdapter extends DisabledAdapter {
  constructor() {
    super("streamingcommunity");
  }
}
