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
  await ctx.close();
});
