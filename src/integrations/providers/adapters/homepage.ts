import type { ProviderId } from "@/domain/types";
import { PROVIDERS } from "@/domain/providers";
import { DisabledAdapter } from "./base";

/**
 * Licensed providers whose integration is planned but not built. They link
 * to the provider's homepage so "Continua su …" still takes the user there.
 */
export class HomepageAdapter extends DisabledAdapter {
  constructor(id: ProviderId) {
    super(id);
  }
  override getContentUrl(): string | null {
    return PROVIDERS[this.id].homepage;
  }
}
