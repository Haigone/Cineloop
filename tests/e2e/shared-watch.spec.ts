import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("Serate insieme: a series watched with friends shares its place and sits apart on Home", async ({ page }) => {
  // Demo: Marco and Luca watch The Boys together.
  await signIn(page, "/home?c=serie");
  const together = page.locator("section", { has: page.getByRole("heading", { name: "Serate insieme" }) });
  await expect(together.getByRole("link", { name: "The Boys", exact: true })).toBeVisible();
  await expect(together.getByText("Con Luca")).toBeVisible();

  // Start one from a title page.
  await page.goto("/title/attack-on-titan");
  await page.getByRole("button", { name: "Guardala insieme" }).click();
  await page.getByLabel(/Sara Conti/).check();
  await page.getByRole("button", { name: "Guardatela insieme" }).click();
  await expect(page.getByText("Serata insieme con Sara: i progressi sono condivisi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Esci dalla serata" })).toBeVisible();

  // The last anime opened stays the big card on Home, now marked as watched together.
  await page.goto("/home?c=anime");
  await expect(page.getByRole("region", { name: "L'attacco dei giganti" }).getByText("Serata insieme con Sara")).toBeVisible();

  // Leaving keeps the place but takes it out of Serate insieme.
  await page.goto("/title/attack-on-titan");
  await page.getByRole("button", { name: "Esci dalla serata" }).click();
  await expect(page.getByRole("button", { name: "Guardala insieme" })).toBeVisible();

  // Home reopens on the last section: leave it on series for the tests that follow.
  await page.goto("/home?c=serie");
  await expect(together.getByRole("link", { name: "The Boys", exact: true })).toBeVisible();
});
