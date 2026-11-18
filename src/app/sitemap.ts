import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Only pages a visitor without an account can open. Public title and playlist pages get added here when they exist. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/start`, changeFrequency: "monthly", priority: 1 }];
}
