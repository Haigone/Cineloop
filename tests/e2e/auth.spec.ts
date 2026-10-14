import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

test("signed-out visitors start by picking a username, with a way to sign in", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/start\?next=%2Fwishlist/);
  await expect(page.getByRole("heading", { level: 1, name: "Scegli un username" })).toBeVisible();
  await expect(page.getByText("Ti servirà l’estensione CineLoop.")).toBeVisible();
  await page.getByRole("link", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fwishlist/);
});

test("a guest uses the site with only a username, then registers and keeps everything", async ({ page }) => {
  const id = Date.now().toString(36);
  await page.goto("/start");
  await page.getByLabel("Username").fill(`ospite${id}`);
  await page.getByRole("button", { name: "Inizia" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/library");
  const banner = page.getByRole("status").filter({ hasText: "Non sei ancora registrato." });
  await expect(banner).toBeVisible();
  await banner.getByRole("link", { name: "Registrati" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Completa la registrazione" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue(`ospite${id}`);
  await page.getByLabel("Nome").fill("Ospite Registrato");
  await page.getByLabel("Email").fill(`ospite${id}@example.com`);
  await page.getByLabel("Password").fill("una-password-lunga");
  await page.getByRole("button", { name: "Completa la registrazione" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Non sei ancora registrato.")).toHaveCount(0);
  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 3, name: "Dark" })).toBeVisible();
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
  await expect(page).toHaveURL(/\/start/);
});

test("the demo button signs in without typing", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entra con l'account demo" }).click();
  await expect(page).toHaveURL(/\/home$/);
  // Nothing is playing in the demo, so the hero is the last title opened.
  await expect(page.getByText("L’ultimo che hai aperto")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Stranger Things" })).toBeVisible();
});

test("a new account starts by picking Netflix series it liked", async ({ page }) => {
  const id = Date.now().toString(36);
  await page.goto("/register");
  await page.getByLabel("Nome").fill("Nuovo Utente");
  await page.getByLabel("Username").fill(`nuovo${id}`);
  await page.getByLabel("Email").fill(`nuovo${id}@example.com`);
  await page.getByLabel("Password").fill("una-password-lunga");
  await page.getByRole("button", { name: /Crea/ }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 2, name: "Crime" })).toBeVisible();
  for (const name of ["Breaking Bad", "Dark", "Arcane"]) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByText("3 scelte")).toBeVisible();
  await page.getByRole("link", { name: "Vedi i consigli per te" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("heading", { name: "Per te" })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 3, name: "Breaking Bad" })).toBeVisible();
});
