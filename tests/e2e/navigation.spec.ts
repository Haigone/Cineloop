import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = [
  { label: /^(La mia libreria|Libreria)$/, path: "/library", heading: "La mia libreria" },
  { label: /^Wishlist$/, path: "/wishlist", heading: "Wishlist" },
  { label: /^Amici$/, path: "/friends", heading: "Amici" },
  { label: /^(Serate insieme|Serate)$/, path: "/watch-party", heading: "Serate insieme" },
];

test("primary navigation reaches every section", async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Principale" });
  for (const p of PAGES) {
    await nav.getByRole("link", { name: p.label }).click();
    await expect(page).toHaveURL(new RegExp(`${p.path}$`));
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: p.label })).toHaveAttribute("aria-current", "page");
  }
});

test("search finds a title and opens it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop search box");
  await signIn(page);
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("shog");
  await page.getByRole("option", { name: /Shōgun/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Shōgun" })).toBeVisible();
});

test("unknown titles show the not-found state", async ({ page }) => {
  await signIn(page);
  await page.goto("/title/non-esiste");
  await expect(page.getByText("Questo titolo non è nel catalogo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Torna alla libreria" })).toBeVisible();
});
