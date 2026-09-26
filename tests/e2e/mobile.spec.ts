import { open } from "./helpers";
import { test, expect } from "@playwright/test";

test("mobile: demo dashboard, bottom nav and drawer work", async ({ page }) => {
  await open(page, "/login");
  await page.getByRole("button", { name: "Explore the demo workspace" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Demo workspace — sample data")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/calendar/, { timeout: 60_000 }); // first dev-mode compile can be slow
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Strategies" }).click();
  await expect(page.getByRole("heading", { name: "Strategies" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
