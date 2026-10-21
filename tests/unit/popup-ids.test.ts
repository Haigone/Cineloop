import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("extension popup", () => {
  it("only looks up elements that popup.html has: a missing one throws and leaves the popup blank", () => {
    const html = readFileSync("extension/popup.html", "utf8");
    const js = readFileSync("extension/popup.js", "utf8");
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const used = [...js.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]);
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });
});
