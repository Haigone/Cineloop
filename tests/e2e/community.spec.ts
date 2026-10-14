import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("save a Community playlist and add only its missing titles to the wishlist", async ({ page }) => {
  await signIn(page, "/community");
  const card = page.getByRole("listitem").filter({ has: page.getByText("Adrenalina pura", { exact: true }) });
  await expect(card.getByText(/di Luca Ferri · 6 titoli/)).toBeVisible();

  // Dune and Mad Max are already in the wishlist, The Boys is being watched and The Batman was seen.
  await card.getByRole("button", { name: "Aggiungi 2 titoli alla wishlist" }).click();
  await expect(page.getByText("2 titoli in wishlist")).toBeVisible();
  await expect(card.getByRole("button", { name: "Già tutti in wishlist" })).toBeDisabled();

  await card.getByRole("button", { name: "Salva" }).click();
  await expect(card.getByRole("button", { name: "Salvata" })).toBeVisible();

  await page.goto("/wishlist");
  const queue = page.getByRole("main");
  await expect(queue.getByRole("link", { name: /^Narcos/ }).first()).toBeVisible();
  await expect(queue.getByRole("link", { name: /^Peaky Blinders/ }).first()).toBeVisible();
  await expect(queue.getByRole("link", { name: /^The Batman/ })).toHaveCount(0);

  await page.goto("/wishlist?tab=playlists");
  const saved = page.getByRole("region", { name: "Salvate dalla Community" });
  await expect(saved.getByText("Adrenalina pura", { exact: true })).toBeVisible();
  await saved.getByRole("button", { name: "Togli dalle salvate" }).click();
  await expect(saved.getByText("Nessuna playlist salvata.", { exact: false })).toBeVisible();
});

test("publish a playlist in Community and take it back", async ({ page }) => {
  await signIn(page, "/wishlist?tab=playlists");
  await page.getByLabel("Nome della playlist").fill("Pubblica di prova");
  await page.getByRole("button", { name: "Crea playlist" }).click();
  // Any catalogue title can go in, not only the wishlist's.
  await page.getByLabel("Cerca nel catalogo").fill("Narcos");
  await page.getByRole("button", { name: "Aggiungi Narcos a Pubblica di prova" }).click();
  await expect(page.getByRole("list", { name: "Titoli di Pubblica di prova" }).getByRole("link", { name: /^Narcos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Narcos è già in Pubblica di prova" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Pubblica nella Community" }).click();
  await expect(page.getByRole("checkbox", { name: "Pubblica nella Community" })).toBeChecked();
  await expect(page.getByRole("link", { name: "Vedila nella Community" })).toBeVisible();

  await page.goto("/community");
  const card = page.getByRole("listitem").filter({ has: page.getByText("Pubblica di prova", { exact: true }) });
  await expect(card.getByText(/Pubblicata da te/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Salva" })).toHaveCount(0);

  await page.goto("/wishlist?tab=playlists");
  await page.getByRole("checkbox", { name: "Pubblica nella Community" }).click();
  await expect(page.getByRole("checkbox", { name: "Pubblica nella Community" })).not.toBeChecked();
  await expect(page.getByRole("link", { name: "Vedila nella Community" })).toHaveCount(0);
  await page.getByRole("button", { name: "Elimina la playlist Pubblica di prova" }).click();
  await page.getByRole("button", { name: "Elimina “Pubblica di prova”" }).click();
});
