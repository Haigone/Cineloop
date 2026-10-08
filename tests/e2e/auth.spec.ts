import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/login\?next=%2Fwishlist/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill("password-sbagliata");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page.getByText("Email o password non corrispondono")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("sign in returns to the requested page, sign out ends the session", async ({ page }) => {
  await signIn(page, "/friends");
  await expect(page.getByRole("heading", { level: 1, name: "Amici" })).toBeVisible();
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
});

test("the demo button signs in without typing", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entra con l'account demo" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Ora in visione")).toBeVisible();
});
