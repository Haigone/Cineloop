import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("add a title to the wishlist, find it there, remove it and undo", async ({ page }) => {
  await signIn(page, "/title/demon-slayer");
  await page.getByRole("button", { name: "Aggiungi alla mia lista" }).click();
  await expect(page.getByRole("button", { name: "Nella mia lista" })).toBeVisible();

  await page.goto("/wishlist");
  const list = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  // New titles go to the top of the list.
  await expect(list.getByRole("listitem").first()).toContainText("Demon Slayer");

  await list.getByRole("button", { name: "Rimuovi Demon Slayer dalla wishlist" }).click();
  await expect(list).not.toContainText("Demon Slayer");
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(list).toContainText("Demon Slayer");

  await list.getByRole("button", { name: "Rimuovi Demon Slayer dalla wishlist" }).click();
  await expect(list).not.toContainText("Demon Slayer");
  await page.reload();
  await expect(page.getByRole("list", { name: "Wishlist, in ordine di priorità" })).not.toContainText("Demon Slayer");
});
