import { readFileSync } from "node:fs";
// @ts-expect-error jsdom is available as a test dependency but has no installed type declarations.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const script = readFileSync("extension/completion-confirm.js", "utf8");
const doms: Array<{ window: { close: () => void } }> = [];
afterEach(() => {
  for (const dom of doms.splice(0)) dom.window.close();
});

async function renderPrompt(nextUrl: string | null) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  doms.push(dom);
  const pending = {
    key: "animeunity|show|1|2|episode-2|/anime/10/show/episode-2",
    providerId: "animeunity",
    documentTitle: "Titolo",
    nextUrl,
    player: { title: "Titolo", season: 1, episode: 2 },
  };
  const sendMessage = vi.fn(async (message: { type: string; action?: string }) => {
    if (message.type === "completion-pending") return pending;
    return true;
  });
  Object.defineProperty(dom.window, "chrome", {
    configurable: true,
    value: { runtime: { id: "test-extension", sendMessage } },
  });
  dom.window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, sendMessage };
}

describe("episode completion confirmation", () => {
  it("asks before marking an episode complete and explains when no verified next URL exists", async () => {
    const { dom, sendMessage } = await renderPrompt(null);
    expect(dom.window.document.querySelector("#cineloop-completion-confirm")).not.toBeNull();
    expect(dom.window.document.body.textContent).toContain("Il prossimo verrà tracciato quando lo avvii.");
    dom.window.document.querySelector<HTMLButtonElement>("button")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendMessage).toHaveBeenCalledWith({
      type: "completion-decision",
      action: "confirm",
      key: "animeunity|show|1|2|episode-2|/anime/10/show/episode-2",
    });
    expect(dom.window.document.querySelector("#cineloop-completion-confirm")).toBeNull();
  });

  it("records a rejection without marking the episode complete", async () => {
    const { dom, sendMessage } = await renderPrompt("https://www.animeunity.co/anime/10/show/3");
    const buttons = [...dom.window.document.querySelectorAll<HTMLButtonElement>("button")];
    buttons.find((button) => button.textContent === "No, non ancora")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendMessage).toHaveBeenCalledWith({
      type: "completion-decision",
      action: "dismiss",
      key: "animeunity|show|1|2|episode-2|/anime/10/show/episode-2",
    });
    expect(dom.window.document.querySelector("#cineloop-completion-confirm")).toBeNull();
  });
});
