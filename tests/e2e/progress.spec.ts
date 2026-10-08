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
