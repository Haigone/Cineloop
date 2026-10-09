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

test("reorder the wishlist from Home, by dragging and with the arrows", async ({ page }) => {
  await signIn(page, "/home");
  const queue = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  const names = async () => (await queue.getByRole("listitem").getByRole("heading").allInnerTexts()).map((t) => t.trim());
  await expect(queue.getByRole("listitem").nth(2)).toBeVisible();
  const before = await names();
  expect(before.length).toBeGreaterThan(2);

  // Keyboard: the second title moves up to first.
  await queue.getByRole("listitem").nth(1).hover();
  await queue.getByRole("button", { name: `Sposta ${before[1]} prima` }).click();
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);

  // Drag: the first goes after the second.
  const handle = queue.getByRole("listitem").first().locator("[data-drag-handle]");
  const target = queue.getByRole("listitem").nth(1);
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(from.x + ((to.x + to.width * 0.6 - from.x) * i) / 20, from.y + from.height / 2);
  await page.mouse.up();
  const after = [before[0], before[1], ...before.slice(2)];
  await expect.poll(names).toEqual(after);

  // Saved: still in this order after reloading, and on the wishlist page.
  await page.reload();
  await expect(queue.getByRole("listitem").nth(2)).toBeVisible();
  expect((await names()).slice(0, 3)).toEqual(after.slice(0, 3));
  await page.goto("/wishlist");
  const list = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  // The full wishlist mixes sections: Home's series keep their order among the rest.
  await expect(list.getByRole("listitem").nth(2)).toBeVisible();
  const all = await list.getByRole("listitem").allInnerTexts();
  const at = (name: string) => all.findIndex((t) => t.includes(name));
  expect(at(after[0]!)).toBeGreaterThanOrEqual(0);
  expect(at(after[0]!)).toBeLessThan(at(after[1]!));
  expect(at(after[1]!)).toBeLessThan(at(after[2]!));
});

test("Home has a section each for films, series and anime, and reopens on the last one", async ({ page }) => {
  await signIn(page, "/home");
  const tabs = page.getByRole("navigation", { name: "Sezioni della Home" });
  await expect(tabs.getByRole("link", { name: "Serie TV" })).toHaveAttribute("aria-current", "page");
  const queue = page.getByRole("list", { name: "Wishlist, in ordine di priorità" });
  await expect(queue.getByText("Dune - Parte due")).toHaveCount(0);

  await tabs.getByRole("link", { name: "Film" }).click();
  await expect(page).toHaveURL(/\/home\?c=film/);
  await expect(queue.getByRole("heading", { name: "Dune - Parte due" })).toBeVisible();
  await expect(queue.getByText(/Serie ·/)).toHaveCount(0);

  // Opening Home again lands on Film.
  await page.goto("/home");
  await expect(tabs.getByRole("link", { name: "Film" })).toHaveAttribute("aria-current", "page");

  // A background of your own, saved in Impostazioni.
  await page.goto("/settings#sfondi");
  await page.getByLabel("Sfondo Film").selectOption({ label: "Interstellar" });
  await expect(page.getByText("Sfondo di Film salvato")).toBeVisible();
  await page.goto("/home");
  await expect(page.getByRole("link", { name: "Sfondo: Interstellar" })).toBeVisible();

  // Back to the default for the other tests.
  await page.goto("/settings#sfondi");
  await page.getByLabel("Sfondo Film").selectOption("");
  await expect(page.getByText("Sfondo di Film salvato")).toBeVisible();
  await page.goto("/home?c=serie");
  await expect(tabs.getByRole("link", { name: "Serie TV" })).toHaveAttribute("aria-current", "page");
});
