import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = [
  "/home",
  "/home?c=anime",
  "/library",
  "/wishlist",
  "/explore",
  "/community",
  "/friends",
  "/watch-party",
  "/rankings",
  "/settings",
  "/wrapped",
  "/title/non-esiste",
];

test("no page scrolls sideways on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone layout only");
  await signIn(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
      path,
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(
      1,
    );
  }
});
