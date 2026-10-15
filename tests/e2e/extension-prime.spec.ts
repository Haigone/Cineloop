import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { DEMO } from "./helpers";

/**
 * Prime Video, granted at install like Netflix: no permission to give. The
 * test answers primevideo.com itself (nothing reaches Amazon) with a title
 * page whose player overlay is open and playing, as prime-page.js expects it.
 */
test("Prime Video is recognised with no permission to grant", async ({ baseURL }) => {
  test.slow();
  const dir = mkdtempSync(path.join(tmpdir(), "cineloop-ext-prime-"));
  const ext = path.join(dir, "extension");
  cpSync("extension", ext, { recursive: true });

  const ctx = await chromium.launchPersistentContext(path.join(dir, "profile"), {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
  });
  const player = `<div class="webPlayerSDKContainer" style="width:200px;height:120px">
    <video muted></video>
    <h1 class="atvwebplayersdk-title-text">Dark</h1>
    <h2 class="atvwebplayersdk-subtitle-text">Stagione 2, Ep. 3 Fantasmi</h2>
    <div class="atvwebplayersdk-timeindicator-text">10:00 / 40:00</div>
  </div><script>
    const c = document.createElement("canvas"); const g = c.getContext("2d");
    setInterval(() => { g.fillStyle = "#" + Math.floor(Math.random() * 4095).toString(16); g.fillRect(0, 0, 10, 10); }, 100);
    const v = document.querySelector("video"); v.srcObject = c.captureStream(10); v.play();
  </script>`;
  await ctx.route("https://www.primevideo.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<title>Prime Video: Dark</title>${route.request().url().includes("/detail/") ? player : ""}` }),
  );
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(worker.url()).host;

  const site = await ctx.newPage();
  await site.goto(`${baseURL}/login`);
  await site.getByLabel("Email").fill(DEMO.email);
  await site.getByLabel("Password").fill(DEMO.password);
  await site.getByRole("button", { name: "Accedi", exact: true }).click();
  await site.waitForURL("**/home");
  await site.goto(`${baseURL}/settings#estensione`);
  await site.getByRole("button", { name: "Genera codice" }).click();
  const code = (await site.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!;

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.getByLabel("Indirizzo del sito").fill(baseURL!);
  await popup.getByLabel("Codice").fill(code);
  await popup.locator("#pair-form button[type=submit]").click();
  await expect(popup.locator("#who")).toHaveText("Marco Bianchi");
  await popup.getByText("Servizi collegati").click();
  await expect(popup.locator("#manage-prime")).toHaveText("Attivo ✓");

  const prime = await ctx.newPage();
  await prime.goto("https://www.primevideo.com/-/it/detail/Dark/0KRGHGZCHKS920ZQGY5LBRF7MA/ref=atv_dp");
  // prime-page.js looks every 5 seconds; the heartbeat follows at once.
  await expect
    .poll(async () => {
      await popup.reload();
      await popup.locator("#watching, #idle").first().waitFor({ state: "attached" });
      await popup.waitForTimeout(1500);
      return (await popup.locator("#watching-title").textContent()) ?? "";
    }, { timeout: 30_000 })
    .toBe("Dark");
  await expect(popup.locator("#watching-meta")).toHaveText("2017 · S2E3 · su Prime Video");
  await expect(popup.locator("#player-read")).toContainText("25% visto");

  // Watch together: Luca joins Marco and pauses on his side (his extension, here
  // its API, on the same Prime episode): Marco's Prime video pauses too.
  const other = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const luca = await (await other.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await luca.goto(`${baseURL}/login`);
  await luca.getByLabel("Email").fill("luca@cineloop.dev");
  await luca.getByLabel("Password").fill(DEMO.password);
  await luca.getByRole("button", { name: "Accedi", exact: true }).click();
  await luca.waitForURL("**/home");
  await luca.getByRole("button", { name: "Guarda insieme: Marco, Dark" }).click();
  await expect(luca.getByRole("dialog")).toContainText("posizione, play e pausa restano allineati");
  await luca.goto(`${baseURL}/settings#estensione`);
  await luca.getByRole("button", { name: "Genera codice" }).click();
  const lucaCode = (await luca.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!;
  const paired = await (await luca.request.post(`${baseURL}/api/extension/pair`, { data: { code: lucaCode } })).json();
  expect(await prime.evaluate(() => document.querySelector("video")!.paused)).toBe(false);
  await expect(async () => {
    const res = await luca.request.post(`${baseURL}/api/extension/party`, {
      headers: { Authorization: `Bearer ${paired.token}` },
      data: { externalId: "0KRGHGZCHKS920ZQGY5LBRF7MA", season: 2, episode: 3, position: 600, paused: true, action: "pause" },
    });
    expect((await res.json()).party).toMatchObject({ sameEpisode: true });
  }).toPass({ timeout: 10_000 });
  await expect.poll(() => prime.evaluate(() => document.querySelector("video")!.paused), { timeout: 30_000 }).toBe(true);
  await popup.reload();
  await popup.getByRole("tab", { name: "Guarda insieme" }).click();
  await expect(popup.locator("#room-state")).toContainText("pausa di Luca Ferri");
  await other.close();
  // Leave the demo store as it was: Marco stops watching, so the room ends.
  await prime.close();
  await popup.evaluate(async () => {
    const ext = (globalThis as unknown as { chrome: { storage: { local: { get(keys: string[]): Promise<Record<string, string>> } } } }).chrome;
    const { server, token } = await ext.storage.local.get(["server", "token"]);
    await fetch(new URL("/api/extension/presence", server), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  });
  await ctx.close();
});
