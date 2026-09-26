import type { Page } from "@playwright/test";

/**
 * Navigate and wait until streamed Suspense content has been swapped in.
 * During React streaming a hidden copy of the content briefly exists in the DOM,
 * which trips Playwright's strict-mode locators if we act too early.
 */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
