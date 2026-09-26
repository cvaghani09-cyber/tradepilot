import { open } from "./helpers";
import { test, expect, type Page } from "@playwright/test";

/** Phase 5: strategy → playbook entry → checklist (required) → manual trade → plan adherence. */
const email = `p5-${Date.now()}@test.local`;

test.describe.serial("playbook, checklists and trading plan", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await open(page, "/register");
    await page.getByLabel("Name").fill("Phase Five");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("phase5-password-1");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await open(page, "/accounts/new");
    await page.getByLabel("Account name").fill("Main");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
    await open(page, "/strategies/new");
    await page.getByLabel("Name").fill("SMT + CISD + FVG");
    await page.getByRole("button", { name: "Save strategy" }).click();
    await page.waitForURL(/\/strategies\/[0-9a-f-]{36}$/);
  });
  test.afterAll(async () => page.close());

  test("creates a playbook entry linked to a strategy", async () => {
    await open(page, "/playbook");
    await expect(page.getByText("Your playbook is empty")).toBeVisible();
    await page.getByRole("link", { name: "Create first entry" }).click();
    await page.getByLabel("Setup name").fill("SMT at HTF level");
    await page.getByLabel("Strategy").selectOption({ label: "SMT + CISD + FVG" });
    await page.getByLabel("Rules", { exact: true }).fill("1. HTF level\n2. SMT\n3. CISD\n4. FVG entry");
    await page.getByLabel("Invalid conditions").fill("High-impact news");
    await page.getByRole("button", { name: "Save entry" }).click();
    await page.waitForURL(/\/playbook\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "SMT at HTF level" })).toBeVisible();
    await expect(page.getByText("No closed trades match this entry yet.")).toBeVisible();
  });

  test("adds a required checklist to the entry", async () => {
    await page.getByRole("button", { name: "New checklist" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Before entering");
    for (const item of ["HTF level identified", "SMT confirmed", "Stop placed"]) {
      await page.getByLabel("New checklist item").fill(item);
      await page.keyboard.press("Enter");
    }
    await page.getByRole("switch", { name: "Required before saving manual trades" }).click();
    await page.getByRole("button", { name: "Save checklist" }).click();
    await expect(page.getByText("Required for manual trades")).toBeVisible();
  });

  test("blocks a manual trade until the required checklist is complete", async () => {
    await open(page, "/trades/new");
    await page.getByLabel("Contract", { exact: true }).fill("NQZ6");
    await page.getByLabel("Entry price").fill("20000");
    await page.getByLabel("Entry time").fill("2026-03-02T09:35:10");
    await page.getByLabel("Exit price").fill("20010");
    await page.getByLabel("Exit time").fill("2026-03-02T09:50:10");
    await page.getByLabel("Commission (round trip)").fill("0");
    await page.getByLabel("Other fees (round trip)").fill("0");
    await page.getByLabel("Initial stop").fill("19995");
    await page.getByLabel("Strategy").selectOption({ label: "SMT + CISD + FVG" });
    await page.getByLabel("HTF level identified").check();
    await page.getByRole("button", { name: "Save trade" }).click();
    await expect(page.getByText(/Complete every item in the required checklist/)).toBeVisible();
    await page.getByLabel("SMT confirmed").check();
    await page.getByLabel("Stop placed").check();
    await page.getByRole("button", { name: "Save trade" }).click();
    await page.waitForURL(/\/trades\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Pre-trade checklist")).toBeVisible();
    await expect(page.getByText("3/3")).toBeVisible();
  });

  test("pins the trade to the playbook and sees its statistics", async () => {
    await page.getByRole("button", { name: "Pin to SMT at HTF level" }).click();
    await expect(page.getByText("Pinned", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "SMT at HTF level" }).click();
    await expect(page.getByText("Historical statistics")).toBeVisible();
    await expect(page.getByText("100.0%")).toBeVisible();
    await expect(page.getByText("+2.00R").first()).toBeVisible(); // 10 pts on a 5-pt stop
    await expect(page.getByText("NQZ6 Long").first()).toBeVisible();
  });

  test("saves a trading plan and shows adherence", async () => {
    await open(page, "/plan");
    await page.getByLabel("Daily loss limit ($)").fill("500");
    await page.getByLabel("Maximum trades per day").fill("2");
    await page.getByLabel("Markets").fill("NQ only");
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Trading plan saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Markets")).toHaveValue("NQ only");
    await expect(page.getByText("Days within plan")).toBeVisible();
    await expect(page.getByText("1/1")).toBeVisible();
  });
});
