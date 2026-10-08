import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("pick a top 3 and see it on the podium", async ({ page }) => {
  await signIn(page, "/rankings");
  await page.getByRole("button", { name: /Scegli i tuoi 3|Cambia il podio/ }).click();
  const dialog = page.getByRole("dialog", { name: "Il tuo podio" });
  const options = dialog.getByRole("list").last().getByRole("button");
  // Start from an empty podium, then pick the first three in order.
  for (const chip of await dialog.getByRole("button", { name: /^Togli / }).all()) await chip.click();
  const names: string[] = [];
  for (let i = 0; i < 3; i++) {
    const option = options.nth(i);
    names.push((await option.innerText()).split("\n")[0]!.trim());
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }
  await dialog.getByRole("button", { name: "Salva il podio" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem", { name: `1° posto: ${names[0]}` })).toBeVisible();
  await expect(page.getByRole("listitem", { name: `3° posto: ${names[2]}` })).toBeVisible();
  // The rest of the rankings is still below.
  await expect(page.getByRole("heading", { name: "Come voti" })).toBeVisible();
});
