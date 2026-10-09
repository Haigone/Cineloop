import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { DEMO } from "./helpers";

/**
 * The real extension, loaded into Chromium, against this server. netflix.com
 * is answered by the test itself: nothing reaches Netflix. The test copy
 * grants the netflix.com permission up front, because a headless browser
 * cannot click the permission prompt the popup normally shows.
 */
test("pair the extension, watch on Netflix, and a friend joins", async ({ baseURL }) => {
  test.slow();
  const dir = mkdtempSync(path.join(tmpdir(), "cineloop-ext-"));
  const ext = path.join(dir, "extension");
  cpSync("extension", ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(ext, "manifest.json"), "utf8"));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest));

  const ctx = await chromium.launchPersistentContext(path.join(dir, "profile"), {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
  });
  const id = () => String(10_000_000 + Math.floor(Math.random() * 89_000_000));
  const [show, ep1, ep2, named, named2, named3, named4] = [id(), id(), id(), id(), id(), id(), id()];
  // One episode page carries the player's title line, as Netflix shows it.
  const player = `<div data-uia="video-title"><h4>Stranger Things</h4><span>S4:E5</span><span>Capitolo cinque</span></div>`;
  // Another layout: no heading, Italian labels.
  const player2 = `<div data-uia="video-title"><div><span>Dark</span></div><span>St. 2: Ep. 3</span><span>Fantasmi</span></div>`;
  // Often the player shows the episode alone.
  const player3 = `<div data-uia="video-title"><h4>Dark</h4><span>E4</span><span>Doppiogiochisti</span></div>`;
  const player4 = `<div data-uia="video-title"><h4>Peaky Blinders</h4><span>E2</span><span>Episodio 2</span></div>`;
  // A playing, muted video stands in for Netflix's player.
  const video = `<video muted></video><script>
    const c = document.createElement("canvas"); const g = c.getContext("2d");
    setInterval(() => { g.fillStyle = "#" + Math.floor(Math.random() * 4095).toString(16); g.fillRect(0, 0, 10, 10); }, 100);
    const v = document.querySelector("video"); v.srcObject = c.captureStream(10); v.play();
  </script>`;
  await ctx.route("https://www.netflix.com/**", (route) => {
    const url = route.request().url();
    // "La mia lista": three cards, as Netflix links them.
    if (url.includes("/browse/my-list")) {
      const card = (id: string, name: string) => `<div class="title-card"><a href="/watch/${id}?tctx=0" aria-label="${name}"><img alt="${name}"></a></div>`;
      return route.fulfill({
        contentType: "text/html",
        body: `<title>Netflix</title>${card("80114855", "Squid Game")}${card("80117715", "Mindhunter")}${card("81234567", "Un titolo che non esiste")}`,
      });
    }
    const body = `<title>Netflix</title>${[[named, player], [named2, player2], [named3, player3], [named4, player4]].find(([n]) => url.includes(n!))?.[1] ?? ""}${url.includes("/watch/") ? video : ""}`;
    return route.fulfill({ contentType: "text/html", body });
  });
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(worker.url()).host;

  // A one-time code from Impostazioni.
  const site = await ctx.newPage();
  await site.goto(`${baseURL}/login`);
  await site.getByLabel("Email").fill(DEMO.email);
  await site.getByLabel("Password").fill(DEMO.password);
  await site.getByRole("button", { name: "Accedi", exact: true }).click();
  await site.waitForURL("**/home");
  await site.goto(`${baseURL}/settings#estensione`);
  await site.getByRole("button", { name: "Genera codice" }).click();
  const code = (await site.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!;

  // Pair in the popup.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.getByLabel("Indirizzo del sito").fill(baseURL!);
  await popup.getByLabel("Codice").fill(code);
  await popup.locator("#pair-form button[type=submit]").click();
  await expect(popup.locator("#who")).toHaveText("Marco Bianchi");

  // Netflix's tab title doesn't name the show: confirm it once.
  const netflix = await ctx.newPage();
  await netflix.goto(`https://www.netflix.com/browse?jbv=${show}`);
  await netflix.goto(`https://www.netflix.com/watch/${ep1}`);
  await popup.reload();
  await expect(popup.getByText("Che cosa stai guardando?")).toBeVisible();
  await popup.getByLabel("Cerca un titolo").fill("dark");
  await popup.locator("#results button", { hasText: "Dark" }).first().click();
  await expect(popup.locator("#watching-title")).toHaveText("Dark");
  await popup.getByRole("tab", { name: "Guarda insieme" }).click();
  await popup.getByText("Usi un’altra estensione watch party?").click();
  await popup.locator("#party-url").fill("https://www.teleparty.com/join/e2e");
  await popup.locator("#party-form button[type=submit]").click();

  // The next episode is recognised from the show.
  await netflix.goto(`https://www.netflix.com/browse?jbv=${show}`);
  await netflix.goto(`https://www.netflix.com/watch/${ep2}`);
  await popup.reload();
  await expect(popup.locator("#watching-title")).toHaveText("Dark");
  await expect(popup.locator("#confirm")).toBeHidden();

  // Luca sees Marco live on his dashboard and joins.
  const other = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const luca = await (await other.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await luca.goto(`${baseURL}/login`);
  await luca.getByLabel("Email").fill("luca@cineloop.dev");
  await luca.getByLabel("Password").fill(DEMO.password);
  await luca.getByRole("button", { name: "Accedi", exact: true }).click();
  await luca.waitForURL("**/home");
  await luca.getByRole("button", { name: "Guarda insieme: Marco, Dark" }).click();
  const dialog = luca.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Entra nella stanza di Marco/ })).toHaveAttribute("href", "https://www.teleparty.com/join/e2e");
  await expect(dialog.getByRole("link", { name: /Apri su Netflix/ })).toHaveAttribute("href", `https://www.netflix.com/watch/${ep2}`);

  await popup.reload();
  await expect(popup.getByRole("tab", { name: "Guarda insieme" })).toHaveAttribute("aria-selected", "true");
  await expect(popup.locator("#room-members")).toHaveText("Con te: Luca Ferri");

  // Luca pauses on his side (his own extension, here its API): Marco's video pauses too.
  await luca.goto(`${baseURL}/settings#estensione`);
  await luca.getByRole("button", { name: "Genera codice" }).click();
  const lucaCode = (await luca.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!;
  const paired = await (await luca.request.post(`${baseURL}/api/extension/pair`, { data: { code: lucaCode } })).json();
  expect(await netflix.evaluate(() => document.querySelector("video")!.paused)).toBe(false);
  await expect(async () => {
    const res = await luca.request.post(`${baseURL}/api/extension/party`, {
      headers: { Authorization: `Bearer ${paired.token}` },
      data: { externalId: ep2, position: 3, paused: true, action: "pause" },
    });
    expect((await res.json()).party).not.toBeNull();
  }).toPass({ timeout: 10_000 });
  await expect.poll(() => netflix.evaluate(() => document.querySelector("video")!.paused), { timeout: 30_000 }).toBe(true);
  await popup.reload();
  await expect(popup.locator("#room-state")).toContainText("pausa di Luca Ferri");

  // Not visible: Luca no longer sees Marco live.
  await popup.locator("#visible").uncheck();
  await luca.goto(`${baseURL}/home`);
  await expect(luca.getByRole("button", { name: /Guarda insieme: Marco/ })).toHaveCount(0);
  await popup.locator("#visible").check();

  // When the player names the show and episode, nothing needs confirming.
  await netflix.goto(`https://www.netflix.com/watch/${named}`);
  await expect(async () => {
    await popup.reload();
    await expect(popup.locator("#watching-title")).toHaveText("Stranger Things", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(popup.locator("#watching-meta")).toContainText("S4E5");
  await expect(popup.getByText("Che cosa stai guardando?")).toBeHidden();
  await expect(popup.locator("#player-read")).toContainText("Stranger Things · S4E5");
  await site.goto(`${baseURL}/home`);
  await expect(site.getByText("S4E5").first()).toBeVisible();

  await netflix.goto(`https://www.netflix.com/watch/${named2}`);
  await expect(async () => {
    await popup.reload();
    await expect(popup.locator("#watching-title")).toHaveText("Dark", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(popup.locator("#watching-meta")).toContainText("S2E3");

  // "E4" alone: the season follows on from the episode before.
  await netflix.goto(`https://www.netflix.com/watch/${named3}`);
  await expect(async () => {
    await popup.reload();
    await expect(popup.locator("#watching-meta")).toContainText("S2E4", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // A new series with the episode alone: the popup asks for the season once.
  await netflix.goto(`https://www.netflix.com/watch/${named4}`);
  await expect(async () => {
    await popup.reload();
    await expect(popup.locator("#watching-title")).toHaveText("Peaky Blinders", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(popup.locator("#watching-meta")).not.toContainText("E2");
  await popup.getByRole("tab", { name: "Sto guardando" }).click();
  await popup.getByRole("button", { name: "Stagione 3" }).click();
  await expect(popup.locator("#watching-meta")).toContainText("S3E2");
  await expect(popup.locator("#season-ask")).toBeHidden();

  // Closing Netflix ends the session.
  await netflix.close();
  await popup.reload();
  await popup.getByRole("tab", { name: "Sto guardando" }).click();
  await expect(popup.getByText("Niente in riproduzione")).toBeVisible();

  // "La mia lista" on Netflix goes to the wishlist, from the Importa tab.
  const list = await ctx.newPage();
  await list.goto("https://www.netflix.com/browse/my-list");
  await popup.reload();
  await popup.getByRole("tab", { name: "Importa" }).click();
  await popup.getByRole("button", { name: "Importa 3 titoli" }).click();
  await expect(popup.getByRole("status")).toContainText("Aggiunti alla wishlist: 1.");
  await expect(popup.getByRole("status")).toContainText("Già su CineLoop: 1.");
  await expect(popup.getByRole("status")).toContainText("Non trovati nel catalogo: 1.");
  await expect(popup.locator("#import-missing")).toContainText("Un titolo che non esiste");
  // The test has polled a lot: the list may wait for the per-minute request budget.
  await expect(async () => {
    await popup.reload();
    await popup.getByRole("tab", { name: "Watchlist" }).click();
    await expect(popup.locator("#panel-list")).toContainText("Squid Game", { timeout: 2000 });
  }).toPass({ timeout: 90_000, intervals: [5000] });
  await list.close();

  await other.close();
  await ctx.close();
});
