import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("set by hand where you are in a series and find it on Home", async ({ page }) => {
  await signIn(page, "/title/peaky-blinders");
  await page.getByRole("button", { name: /Segna dove sei arrivato|Aggiorna a mano/ }).click();
  const dialog = page.getByRole("dialog", { name: "Dove sei arrivato" });
  await dialog.getByLabel("Stagione").selectOption("2");
  await dialog.getByLabel("Episodio").selectOption("3");
  await dialog.getByLabel("Minuto").fill("29");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Dove sei arrivato" }).getByText("S2E3")).toBeVisible();
  await expect(page.getByText("50% visto")).toBeVisible();

  await page.goto("/home");
  await expect(page.getByText("Peaky Blinders").first()).toBeVisible();
  await expect(page.getByText("S2E3").first()).toBeVisible();
});
