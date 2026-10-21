import { describe, expect, it } from "vitest";
import { readSupportConfig } from "@/lib/support";

describe("donation link and ad slot", () => {
  it("are off with no variables", () => {
    expect(readSupportConfig({})).toEqual({ donationUrl: null, ads: null });
  });

  it("accepts only an https donation link", () => {
    expect(readSupportConfig({ DONATION_URL: "https://ko-fi.com/cineloop" }).donationUrl).toBe("https://ko-fi.com/cineloop");
    expect(readSupportConfig({ DONATION_URL: "http://ko-fi.com/x" }).donationUrl).toBeNull();
    expect(readSupportConfig({ DONATION_URL: "javascript:alert(1)" }).donationUrl).toBeNull();
  });

  it("needs the switch, a valid client and a slot to show ads", () => {
    const on = { ADS_ENABLED: "true", ADSENSE_CLIENT: "ca-pub-1234567890123456", ADSENSE_SLOT: "1234567890" };
    expect(readSupportConfig(on).ads).toEqual({ client: "ca-pub-1234567890123456", slot: "1234567890" });
    expect(readSupportConfig({ ...on, ADS_ENABLED: "false" }).ads).toBeNull();
    expect(readSupportConfig({ ...on, ADSENSE_CLIENT: "x" }).ads).toBeNull();
  });
});
