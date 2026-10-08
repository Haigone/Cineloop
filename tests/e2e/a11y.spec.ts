import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = ["/home", "/library", "/wishlist", "/rankings", "/friends", "/friends/giulia", "/watch-party", "/profile", "/settings", "/title/arcane"];

test("login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(serious(results.violations)).toEqual([]);
});

test("app pages have no serious accessibility violations", async ({ page }) => {
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
