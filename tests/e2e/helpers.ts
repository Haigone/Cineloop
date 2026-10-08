import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "marco@cineloop.dev", password: "cineloop-demo" };

export async function signIn(page: Page, next = "/home") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === next);
}
