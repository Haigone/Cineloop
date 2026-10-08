import { describe, expect, it } from "vitest";
import type { Presence } from "@/domain/types";
import { FLUSH_MINUTES, isLive, nextPresence, normalizePartyUrl, PRESENCE_TTL_MS, type Detected } from "@/domain/presence";
import { formatPairingCode, normalizePairingCode, PAIRING_ALPHABET } from "@/domain/pairing";

const seen: Detected = { providerId: "netflix", externalId: "1", label: null, season: null, episode: null, url: "https://www.netflix.com/watch/1" };
const t0 = new Date("2026-10-08T20:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

describe("nextPresence", () => {
  it("starts a session on the first observation", () => {
    const step = nextPresence("u", null, seen, t0);
    expect(step).toMatchObject({ started: true, ended: null, flushMinutes: 0 });
    expect(step.presence).toMatchObject({ externalId: "1", titleId: null, guestIds: [], pendingMinutes: 0 });
  });

  it("counts time between heartbeats, but never a long gap", () => {
    let p = nextPresence("u", null, seen, t0).presence;
    p = nextPresence("u", p, seen, at(1)).presence;
    expect(p.pendingMinutes).toBeCloseTo(1);
    p = nextPresence("u", p, seen, at(2.5)).presence; // inside the TTL, but a 1.5 min gap
    expect(p.pendingMinutes).toBeCloseTo(2.5);
    expect(isLive(p, at(2.5 + PRESENCE_TTL_MS / 60_000 - 0.1))).toBe(true);
    expect(isLive(p, at(2.5 + PRESENCE_TTL_MS / 60_000 + 0.1))).toBe(false);
  });

  it("stores watch time in chunks once the title is known", () => {
    let p: Presence = { ...nextPresence("u", null, seen, t0).presence, titleId: "dark" };
    let flushed = 0;
    for (let m = 1; m <= 25; m++) {
      const step = nextPresence("u", p, seen, at(m));
      flushed += step.flushMinutes;
      p = step.presence;
    }
    expect(flushed).toBe(2 * FLUSH_MINUTES);
    expect(flushed + p.pendingMinutes).toBeCloseTo(25);
  });

  it("does not store time for an unrecognised title", () => {
    let p = nextPresence("u", null, seen, t0).presence;
    for (let m = 1; m <= 12; m++) p = nextPresence("u", p, seen, at(m)).presence;
    expect(nextPresence("u", p, seen, at(13)).flushMinutes).toBe(0);
  });

  it("moving to the next episode keeps the room and the friends who joined", () => {
    const first = { ...nextPresence("u", null, seen, t0).presence, titleId: "dark", partyUrl: "https://p.example/r", guestIds: ["f"] };
    const step = nextPresence("u", first, { ...seen, externalId: "2", url: "https://www.netflix.com/watch/2" }, at(1));
    expect(step.started).toBe(true);
    expect(step.ended).toBe(first);
    expect(step.presence).toMatchObject({ externalId: "2", titleId: null, partyUrl: "https://p.example/r", guestIds: ["f"] });
  });

  it("a stale session is not carried over", () => {
    const old = { ...nextPresence("u", null, seen, t0).presence, partyUrl: "https://p.example/r", guestIds: ["f"] };
    const step = nextPresence("u", old, seen, at(30));
    expect(step.started).toBe(true);
    expect(step.presence).toMatchObject({ partyUrl: null, guestIds: [] });
  });
});

describe("watch-together links", () => {
  it("accepts only https links without credentials", () => {
    expect(normalizePartyUrl(" https://www.teleparty.com/join/abc ")).toBe("https://www.teleparty.com/join/abc");
    expect(normalizePartyUrl("http://example.com")).toBeNull();
    expect(normalizePartyUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePartyUrl("https://user:pw@example.com")).toBeNull();
    expect(normalizePartyUrl("not a url")).toBeNull();
  });
});

describe("pairing codes", () => {
  it("formats 8 unambiguous characters and normalises what the user types", () => {
    const code = formatPairingCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 30]));
    expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    for (const ch of code.replace("-", "")) expect(PAIRING_ALPHABET).toContain(ch);
    expect(normalizePairingCode(code.toLowerCase().replace("-", " "))).toBe(code.replace("-", ""));
  });
});
