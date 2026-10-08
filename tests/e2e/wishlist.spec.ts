import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Both tests change the demo account's wishlist: one at a time.
test.describe.configure({ mode: "serial" });

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

test("reorder the wishlist from Home, by dragging and with the buttons", async ({ page }) => {
  await signIn(page, "/home");
  const queue = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  const names = async () => (await queue.getByRole("link").allInnerTexts()).map((t) => t.trim());
  const before = await names();
  expect(before.length).toBeGreaterThan(2);

  // Keyboard: the second title moves up to first.
  await queue.getByRole("button", { name: `Sposta ${before[1]} su` }).click();
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);

  // Drag: the first goes below the third.
  const handle = queue.getByRole("listitem").first().locator("button").first();
  const target = queue.getByRole("listitem").nth(2);
  await target.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + from.width / 2, from.y + ((to.y + to.height * 0.8 - from.y) * i) / 10);
  await page.mouse.up();
  const after = [before[0], before[2], before[1], ...before.slice(3)];
  await expect.poll(names).toEqual(after);

  // Saved: the wishlist page has the same order.
  await page.goto("/wishlist");
  const list = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  await expect(list.getByRole("listitem").first()).toContainText(after[0]!);
  await expect(list.getByRole("listitem").nth(1)).toContainText(after[1]!);
});
