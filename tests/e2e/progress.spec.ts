import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("set by hand where you are in a series and find it on Home", async ({ page }) => {
  await signIn(page, "/title/peaky-blinders");
  await page.getByRole("button", { name: "A che punto sei?" }).click();
  const dialog = page.getByRole("dialog", { name: "A che punto sei?" });
  await dialog.getByLabel("Stagione").selectOption("2");
  await dialog.getByLabel("Episodio").selectOption("3");
  await dialog.getByLabel("Minuto").fill("29");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Dove sei arrivato" }).getByText("S2E3")).toBeVisible();
  await expect(page.getByText("50% visto")).toBeVisible();

  // The last title opened leads Home, where the same button replaces "add to list".
  await page.goto("/home");
  const hero = page.getByRole("region", { name: "Peaky Blinders" });
  await expect(hero.getByText("S2E3")).toBeVisible();
  await expect(hero.getByRole("button", { name: "Aggiungi alla mia lista" })).toHaveCount(0);
  await hero.getByRole("button", { name: "A che punto sei?" }).click();
  await expect(page.getByRole("dialog", { name: "A che punto sei?" }).getByLabel("Episodio")).toHaveValue("3");
});

test("a series finished before a new season shows in Novità, not in what you are watching", async ({ page }) => {
  await signIn(page, "/home");
  const novita = page.getByRole("region", { name: "Novità: serie con stagioni nuove" });
  await expect(novita.getByText("Stagione 2 nuova")).toBeVisible();
  await expect(novita.getByRole("link", { name: "Arcane" })).toBeVisible();

  // Mark another series as finished up to season 2 of 3.
  await page.goto("/title/narcos");
  await page.getByRole("button", { name: "A che punto sei?" }).click();
  const dialog = page.getByRole("dialog", { name: "A che punto sei?" });
  await dialog.getByText("L'avevo finita").click();
  await expect(dialog.getByLabel("Episodio")).toHaveCount(0);
  await dialog.getByLabel("Vista fino alla stagione").selectOption("2");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Vista fino alla stagione 2.")).toBeVisible();

  await page.goto("/library");
  const libraryNovita = page.getByRole("region", { name: "Novità: serie con stagioni nuove" });
  await expect(libraryNovita.getByRole("link", { name: "Narcos" })).toBeVisible();
  await expect(libraryNovita.getByText("Stagione 3 nuova")).toBeVisible();

  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Narcos" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Novità: serie con stagioni nuove" }).getByRole("link", { name: "Narcos" })).toBeVisible();
});

test("a series page lists its seasons and episodes, with where you are", async ({ page }) => {
  await signIn(page, "/title/frieren");
  const seasons = page.getByRole("region", { name: "Stagioni ed episodi" });
  await seasons.getByRole("button", { name: /Stagione 1/ }).click();
  await expect(seasons.getByText("Episodio 1", { exact: true })).toBeVisible();
  await expect(seasons.getByRole("listitem").filter({ hasText: "Sei qui" }).last()).toContainText("Episodio 18");
});
