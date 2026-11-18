import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

// Next anchors the matcher to the whole path.
const gated = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("SEO files", () => {
  it("lets crawlers reach robots, sitemap and share images without a session", () => {
    for (const path of ["/robots.txt", "/sitemap.xml", "/opengraph-image", "/opengraph-image-1a2b3c", "/twitter-image"]) {
      expect(gated(path), path).toBe(false);
    }
  });

  it("still gates the app pages", () => {
    for (const path of ["/", "/home", "/library", "/title/abc"]) expect(gated(path), path).toBe(true);
  });

  it("points robots at the sitemap and lists only pages open to visitors", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(sitemap().map((e) => e.url)).toEqual([`${SITE_URL}/start`]);
  });
});
