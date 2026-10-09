import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("from the library, mark an in-progress title as seen or remove it", async ({ page }) => {
  await signIn(page, "/library?filter=watching");
  const grid = page.getByRole("main");

  await grid.getByRole("button", { name: "Azioni per The Last of Us" }).click();
  await page.getByRole("button", { name: "Segna come vista" }).click();
  await expect(page.getByText("The Last of Us: segnato come visto")).toBeVisible();
  await expect(grid.getByRole("link", { name: "The Last of Us" })).toHaveCount(0);
  await page.goto("/library?filter=completed");
  await expect(page.getByRole("main").getByRole("link", { name: "The Last of Us" })).toBeVisible();

  await page.goto("/library?filter=watching");
  await grid.getByRole("button", { name: "Azioni per Scissione" }).click();
  await page.getByRole("button", { name: "Rimuovi dalla libreria" }).click();
  await expect(page.getByText("Rimuovere Scissione dalla libreria?")).toBeVisible();
  await page.getByRole("button", { name: "Rimuovi", exact: true }).click();
  await expect(page.getByText("Scissione rimosso dalla libreria")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: "Scissione" })).toHaveCount(0);

  // Seen to the end: Home asks for a rating.
  await page.goto("/home?c=serie");
  await expect(page.getByRole("region", { name: "Vota The Last of Us" })).toBeVisible();
});
