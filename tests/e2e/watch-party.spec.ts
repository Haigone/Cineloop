import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

test.use({ contextOptions: { reducedMotion: "reduce" } });

/** The choices are cards: the radio inside is visually hidden, the card is what gets clicked. */
async function choose(page: Page, name: string) {
  await page.locator("label").filter({ hasText: name }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${name}`) })).toBeChecked();
}

test("step by step: friends, wishlists, titles, then spin the wheel and plan the night", async ({ page }) => {
  await signIn(page, "/watch-party?with=giulia,luca");
  const participants = page.getByRole("list", { name: "Partecipanti" });
  await expect(participants).toContainText("Giulia");
  await expect(participants).toContainText("Luca");
  const next = page.getByRole("button", { name: "Avanti" });
  await next.click();

  // How and when: the wheel, on another day.
  await choose(page, "Gira la ruota");
  await choose(page, "Un altro giorno");
  await next.click();

  // Categories: all three are on by default.
  await expect(page.getByRole("group", { name: "Categorie" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("radiogroup", { name: "Wishlist da usare" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Aggiungi playlist" })).toBeVisible();
  await next.click();

  // The list can be trimmed and grown from the whole catalogue.
  const list = page.getByRole("list", { name: "Titoli della serata" });
  const before = await list.getByRole("listitem").count();
  await list.getByRole("button", { name: /^Togli / }).first().click();
  await expect(list.getByRole("listitem")).toHaveCount(before - 1);
  await page.getByLabel("Aggiungi titoli").fill("Dune");
  await page.getByRole("button", { name: /^Aggiungi Dune/ }).first().click();
  await expect(list).toContainText("Dune");
  await next.click();

  await page.getByRole("button", { name: "Gira la ruota" }).click();
  // With reduced motion the wheel jumps straight to the result.
  await expect(page.getByText("Si guarda", { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Programma la serata" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Serata programmata" })).toBeVisible();

  // It waits under "In programma"; the host can call it off.
  const cancel = page.getByRole("button", { name: /^Annulla la serata di / });
  await expect(cancel).toHaveCount(1);
  await cancel.click();
  await expect(cancel).toHaveCount(0);
});

test("a title already chosen, planned for tomorrow, shows on Home", async ({ page }) => {
  await signIn(page, "/watch-party?with=giulia");
  await page.getByRole("button", { name: "Avanti" }).click();
  await choose(page, "Sappiamo già cosa guardare");
  await choose(page, "Un altro giorno");
  await page.getByRole("button", { name: "Avanti" }).click();

  await page.getByLabel("Cerca il titolo").fill("Dune");
  await page.getByRole("button", { name: /^Scegli Dune - Parte due/ }).click();
  await page.getByRole("button", { name: "Programma la serata" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Serata programmata" })).toBeVisible();

  await page.goto("/home?c=film");
  await expect(page.getByRole("link", { name: /Dune - Parte due.*Con Giulia/ })).toBeVisible();

  // Tidy up: the demo account is shared with the other tests.
  await page.goto("/watch-party");
  await page.getByRole("button", { name: "Annulla la serata di Dune - Parte due" }).click();
  await expect(page.getByRole("button", { name: "Annulla la serata di Dune - Parte due" })).toHaveCount(0);
  await page.goto("/home?c=serie");
});

test("a planned night can be changed and deleted after it is made", async ({ page }) => {
  await signIn(page, "/watch-party?with=giulia");
  await page.getByRole("button", { name: "Avanti" }).click();
  await choose(page, "Sappiamo già cosa guardare");
  await choose(page, "Un altro giorno");
  await page.getByRole("button", { name: "Avanti" }).click();
  await page.getByLabel("Cerca il titolo").fill("Dune");
  await page.getByRole("button", { name: /^Scegli Dune - Parte due/ }).click();
  await page.getByRole("button", { name: "Programma la serata" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Serata programmata" })).toBeVisible();

  // Bring Luca too.
  await page.getByRole("button", { name: "Gestisci la serata di Dune - Parte due" }).click();
  const dialog = page.getByRole("dialog", { name: "Serata: Dune - Parte due" });
  await dialog.getByRole("list", { name: "Partecipanti alla serata" }).getByText("Luca").click();
  await dialog.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Dune - Parte due" }).getByText("Con Giulia, Luca")).toBeVisible();

  // Delete it: a second, named button confirms.
  await page.getByRole("button", { name: "Gestisci la serata di Dune - Parte due" }).click();
  await dialog.getByRole("button", { name: "Elimina la serata" }).click();
  await dialog.getByRole("button", { name: "Elimina “Dune - Parte due”" }).click();
  await expect(page.getByRole("button", { name: "Gestisci la serata di Dune - Parte due" })).toHaveCount(0);
});

test("a night going on can be managed from the nights page", async ({ page }) => {
  await signIn(page, "/watch-party");
  await page.getByRole("button", { name: "Gestisci la serata di The Boys" }).click();
  const dialog = page.getByRole("dialog", { name: "Serata: The Boys" });
  await expect(dialog.getByRole("list", { name: "Persone nella serata" })).toContainText("Luca");
  await expect(dialog.getByRole("list", { name: "Amici da aggiungere" })).toContainText("Giulia");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
