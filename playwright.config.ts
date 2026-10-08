import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build on the in-memory demo
 * store, so every run starts from the same seed. Set E2E_BASE_URL to test a
 * server you started yourself, and PLAYWRIGHT_CHROMIUM_PATH to use a
 * preinstalled Chromium.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // The demo store is shared by all tests in one server process.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  use: {
    baseURL,
    locale: "it-IT",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /navigation|a11y/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${PORT}`,
        url: `${baseURL}/login`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: { DATABASE_URL: "" },
      },
});
