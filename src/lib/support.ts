// Donation link and ad slot, both off until Riccardo sets the variables (see docs/ads-and-donations.md).

export type SupportConfig = {
  donationUrl: string | null;
  ads: { client: string; slot: string } | null;
};

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readSupportConfig(env: Record<string, string | undefined> = process.env): SupportConfig {
  const client = env.ADSENSE_CLIENT?.trim() ?? "";
  const slot = env.ADSENSE_SLOT?.trim() ?? "";
  const adsOn = env.ADS_ENABLED === "true" && /^ca-pub-\d{10,20}$/.test(client) && /^\d{6,20}$/.test(slot);
  return { donationUrl: httpsUrl(env.DONATION_URL), ads: adsOn ? { client, slot } : null };
}
