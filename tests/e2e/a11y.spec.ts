import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = ["/home", "/explore", "/explore?genre=Dramma&type=movie", "/library", "/wishlist", "/wishlist?tab=playlists", "/community", "/rankings", "/friends", "/friends/giulia", "/watch-party", "/profile", "/settings", "/title/arcane", "/welcome"];

test("login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(serious(results.violations)).toEqual([]);
});

test("username-only start page and the guest banner have no serious accessibility violations", async ({ page }) => {
  await page.goto("/start");
  expect(serious((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations)).toEqual([]);
  await page.getByLabel("Username").fill(`a11y${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Inizia" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.goto("/library");
  await expect(page.getByText("Non sei ancora registrato.")).toBeVisible();
  expect(serious((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations)).toEqual([]);
});

test("app pages have no serious accessibility violations", async ({ page }) => {
  // 15 pagine in sequenza: il timeout predefinito è troppo stretto sui runner lenti.
  test.setTimeout(150_000);
  await signIn(page);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(serious(results.violations), path).toEqual([]);
  }
});

function serious(violations: { id: string; impact?: string | null; nodes: { target: unknown }[] }[]) {
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => JSON.stringify(n.target)).join(", ")}`);
}
