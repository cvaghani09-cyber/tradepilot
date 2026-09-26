import { open } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import postgres from "postgres";

/**
 * Core journey: create account → import CSV → review trades → dashboard →
 * filter → open trade → journal notes → strategy analytics.
 * Uses a fresh user each run, so it never touches the demo workspace.
 */
const email = `e2e-${Date.now()}@test.local`;
const password = "e2e-password-123";

async function register(page: Page) {
  await open(page, "/register");
  await page.getByLabel("Name").fill("E2E Trader");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe.serial("trader journey", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => page.close());

  test("1. registers and sees the empty dashboard", async () => {
    await register(page);
    await expect(page.getByRole("heading", { name: "No trades yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Import trades" })).toBeVisible();
  });

  test("2. creates a trading account", async () => {
    await open(page, "/accounts/new");
    await page.getByLabel("Account name").fill("Apex 50k");
    await page.getByLabel("Broker account ID").fill("APEX-001");
    await page.getByLabel("Type", { exact: true }).selectOption("PROP_EVALUATION");
    await page.getByLabel("Maximum drawdown ($)").fill("2500");
    await page.getByLabel("Profit target ($)").fill("3000");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Apex 50k" })).toBeVisible();
    await expect(page.getByText("$50,000.00").first()).toBeVisible();
  });

  test("3. imports a CSV of executions", async () => {
    await open(page, "/import");
    await page.getByTestId("csv-input").setInputFiles(path.join(__dirname, "../fixtures/fills.csv"));
    await expect(page.getByText("columns detected")).toBeVisible();
    await expect(page.locator("#map-contract")).toHaveValue("Contract");
    await page.getByLabel("Date format").selectOption("MDY");
    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(page.getByText(/3 problems found/)).toBeVisible();
    await expect(page.getByText("Reconstructed trades (new fills only)")).toBeVisible();
    await page.getByRole("button", { name: "Confirm import" }).click();
    await expect(page.getByText("Import complete")).toBeVisible();
    await expect(page.getByText(/8 fills imported/)).toBeVisible();
    await expect(page.getByText(/4 trades created/)).toBeVisible();
  });

  test("4. reviews imported trades", async () => {
    await open(page, "/trades");
    await expect(page.getByText("4 of 4 trades match")).toBeVisible();
    await expect(page.getByRole("cell", { name: "NQH6", exact: true })).toBeVisible();
    await expect(page.getByText("+$523.98")).toBeVisible(); // 540 gross − 16.02 fees
  });

  test("5. views the dashboard", async () => {
    await open(page, "/dashboard");
    await expect(page.getByText("Net P&L", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Equity curve" })).toBeVisible();
    await expect(page.getByText("Win rate", { exact: true }).first()).toBeVisible();
  });

  test("6. filters trades by instrument", async () => {
    await open(page, "/trades");
    await page.getByRole("button", { name: /^Instrument/ }).click();
    await page.getByRole("listbox", { name: "Instrument" }).getByText("MNQ").click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/instruments=MNQ/);
    await expect(page.getByText("2 of 4 trades match")).toBeVisible();
    // Filters persist when moving to analytics
    await page.getByRole("link", { name: "Analytics" }).first().click();
    await expect(page).toHaveURL(/analytics\?.*instruments=MNQ/);
  });

  test("7. opens a trade and adds journal notes", async () => {
    await open(page, "/trades?instruments=NQ");
    await page.getByRole("cell", { name: "NQH6", exact: true }).first().click();
    await page.waitForURL(/\/trades\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Executions" })).toBeVisible();
    await page.getByLabel("Trade notes").fill("Waited for CISD, clean entry.");
    await page.getByRole("button", { name: "FOMO" }).click();
    await page.getByRole("button", { name: "Save journal" }).click();
    await expect(page.getByText("Journal saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Trade notes")).toHaveValue("Waited for CISD, clean entry.");
    await expect(page.getByRole("button", { name: "FOMO" })).toHaveAttribute("aria-pressed", "true");
  });

  test("8. screenshots are clearly marked as not built yet", async () => {
    await expect(page.getByText(/Screenshot upload, preview and annotation are planned/)).toBeVisible();
  });

  test("9. creates a strategy, assigns a trade, and sees strategy analytics", async () => {
    await open(page, "/strategies/new");
    await page.getByLabel("Name").fill("SMT + CISD + FVG");
    await page.getByLabel("Market").fill("NQ");
    await page.getByRole("button", { name: "Save strategy" }).click();
    await page.waitForURL(/\/strategies\/[0-9a-f-]{36}$/);
    await open(page, "/trades?instruments=NQ");
    await page.getByRole("cell", { name: "NQH6", exact: true }).first().click();
    await page.getByLabel("Strategy").selectOption({ label: "SMT + CISD + FVG" });
    await page.getByRole("button", { name: "Save journal" }).click();
    await expect(page.getByText("Journal saved")).toBeVisible();
    await open(page, "/strategies");
    const card = page.getByRole("link", { name: /SMT \+ CISD \+ FVG/ });
    await expect(card).toContainText("100.0%");
    await card.click();
    await expect(page.getByText(/Computed from your 1 closed trades/)).toBeVisible();
  });

  test("10. global search finds the trade (Ctrl+K)", async () => {
    await open(page, "/dashboard");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Search trades, accounts, strategies, tags…").fill("clean entry");
    await expect(page.getByRole("option", { name: /NQH6 Long/ })).toBeVisible();
  });
});

test("cannot view another user's trade by id", async ({ page }) => {
  // demo user's trade ids are not visible to a new user
  await open(page, "/register");
  await page.getByLabel("Name").fill("Other");
  await page.getByLabel("Email").fill(`other-${Date.now()}@test.local`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  // A real trade id belonging to a different (demo) user
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5432/tradepilot", { max: 1 });
  const [row] = await sql`select t.id from trades t join users u on u.id = t.user_id where u.is_demo limit 1`;
  await sql.end();
  test.skip(!row, "demo workspace not seeded");
  await open(page, `/trades/${row!.id}`);
  // (Streaming responses keep HTTP 200 once headers are sent; the body is the not-found page with no trade data.)
  await expect(page.getByText("doesn't exist or you don't have access")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Executions" })).toHaveCount(0);
});
