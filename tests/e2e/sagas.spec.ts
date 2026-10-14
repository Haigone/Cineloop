import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a started saga shows its watching order, can be reordered, and Home says what is next", async ({ page }) => {
  // The demo user has seen Dune: Parte due is next and Parte tre is still to come out.
  await signIn(page, "/home?c=film");
  const sagas = page.getByRole("list", { name: "Saghe da completare" });
  await expect(sagas).toBeVisible();
  await expect(sagas.getByText("Saga Dune")).toBeVisible();
  await expect(sagas.getByRole("link", { name: "Dune - Parte due" })).toBeVisible();
  await expect(sagas.getByText("Dune - Parte tre")).toBeVisible();

  await page.goto("/title/dune");
  const section = page.getByRole("region", { name: "Ordine di visione: saga Dune" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Hai visto 1 di 3")).toBeVisible();
  const films = section.getByRole("listitem");
  await expect(films).toHaveCount(3);
  await expect(films.nth(0)).toContainText("Dune");
  await expect(films.nth(1)).toContainText("Il prossimo da vedere");

  // Move Parte tre up: the order is kept after a reload, and can go back to release order.
  await section.getByRole("button", { name: "Sposta Dune - Parte tre prima" }).click();
  await expect(films.nth(1)).toContainText("Dune - Parte tre");
  await expect(section.getByRole("button", { name: "Torna all’ordine di uscita" })).toBeVisible();
  await page.reload();
  await expect(films.nth(1)).toContainText("Dune - Parte tre");
  await section.getByRole("button", { name: "Torna all’ordine di uscita" }).click();
  await expect(films.nth(1)).toContainText("Dune - Parte due");

  // Leave Parte due out: it no longer counts.
  await section.getByRole("switch", { name: "Dune - Parte due" }).click();
  await expect(section.getByRole("switch", { name: "Dune - Parte due" })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(section.getByText("Hai visto 1 di 2")).toBeVisible();
  await section.getByRole("switch", { name: "Dune - Parte due" }).click();
  await expect(section.getByRole("switch", { name: "Dune - Parte due" })).toHaveAttribute("aria-checked", "true");
});
