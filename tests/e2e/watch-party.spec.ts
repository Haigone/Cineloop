import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("pick friends, spin the wheel and save the evening", async ({ page }) => {
  await signIn(page, "/watch-party?with=giulia,luca");
  const participants = page.getByRole("list", { name: "Partecipanti" });
  await expect(participants).toContainText("Giulia");
  await expect(participants).toContainText("Luca");

  await page.getByRole("button", { name: "Gira la ruota" }).click();
  // With reduced motion the wheel jumps straight to the result.
  await expect(page.getByText("Stasera si guarda")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Salva la serata" }).click();
  await expect(page.getByRole("button", { name: "Serata salvata" })).toBeVisible();
});
