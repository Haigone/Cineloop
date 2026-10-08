import { DisabledAdapter } from "./base";

/**
 * Streaming Community. STATUS: under review — no integration.
 *
 * Same situation as Anime Unity: no licensing, no API, no terms granting
 * access, and a frequently changing domain. Disabled until a legitimate
 * mechanism exists. Manual tracking keeps working for any title.
 */
export class StreamingCommunityAdapter extends DisabledAdapter {
  constructor() {
    super("streamingcommunity");
  }
}
