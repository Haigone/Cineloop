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
  await ctx.route("https://www.netflix.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Netflix</title>" }));
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(worker.url()).host;
  const id = () => String(10_000_000 + Math.floor(Math.random() * 89_000_000));
  const [show, ep1, ep2] = [id(), id(), id()];

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
  await luca.getByRole("button", { name: "Unisciti: Marco, Dark" }).click();
  const dialog = luca.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Entra nella stanza di Marco/ })).toHaveAttribute("href", "https://www.teleparty.com/join/e2e");
  await expect(dialog.getByRole("link", { name: /Apri su Netflix/ })).toHaveAttribute("href", `https://www.netflix.com/watch/${ep2}`);

  await popup.reload();
  await expect(popup.locator("#with")).toHaveText("Con te: Luca Ferri");

  // Closing Netflix ends the session.
  await netflix.close();
  await popup.reload();
  await expect(popup.getByText("Niente in riproduzione")).toBeVisible();

  await other.close();
  await ctx.close();
});
