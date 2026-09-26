/**
 * TradePilot database schema (Drizzle ORM / PostgreSQL)
 *
 * Conventions
 *  - UUID primary keys, createdAt/updatedAt on every table
 *  - Every user-owned row carries userId; all service queries filter by it
 *  - Money: numeric(14,2). Prices: numeric(18,6). Read back as JS numbers.
 *  - Timestamps are timestamptz (UTC instants)
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ───────────────────────────── helpers ─────────────────────────────

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const price = (name: string) => numeric(name, { precision: 18, scale: 6, mode: "number" });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// ───────────────────────────── enums ─────────────────────────────

export const accountStatus = pgEnum("account_status", ["EVALUATION", "FUNDED", "ACTIVE", "INACTIVE", "CLOSED"]);
export const accountType = pgEnum("account_type", ["PERSONAL", "PROP_EVALUATION", "PROP_FUNDED", "SIMULATED"]);
export const side = pgEnum("side", ["BUY", "SELL"]);
export const direction = pgEnum("direction", ["LONG", "SHORT"]);
export const tradeStatus = pgEnum("trade_status", ["OPEN", "CLOSED"]);
export const tradeResult = pgEnum("trade_result", ["WIN", "LOSS", "BREAKEVEN", "OPEN"]);
export const executionSource = pgEnum("execution_source", ["MANUAL", "CSV", "API", "DEMO"]);
export const fillRole = pgEnum("fill_role", ["ENTRY", "EXIT"]);
export const importStatus = pgEnum("import_status", ["PREVIEW", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]);
export const importRowKind = pgEnum("import_row_kind", ["EXECUTIONS", "ROUND_TRIPS"]);
export const duplicateStrategy = pgEnum("duplicate_strategy", ["SKIP", "IMPORT", "MERGE"]);
export const screenshotKind = pgEnum("screenshot_kind", [
  "BEFORE",
  "ENTRY",
  "EXIT",
  "POST",
  "DAILY",
  "PLAYBOOK",
  "STRATEGY",
]);
export const drawdownType = pgEnum("drawdown_type", ["STATIC", "TRAILING_EOD", "TRAILING_INTRADAY"]);

// ───────────────────────────── identity ─────────────────────────────

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  theme: text("theme").notNull().default("dark"),
  /** Demo workspaces are separate users — demo data never mixes with real data */
  isDemo: boolean("is_demo").notNull().default(false),
  preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
  ...timestamps,
});

export type UserPreferences = {
  tradeColumns?: string[];
  dashboardWidgets?: string[];
  requireChecklist?: boolean;
};

// ───────────────────────────── accounts ─────────────────────────────

export const brokers = pgTable(
  "brokers",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    website: text("website"),
    ...timestamps,
  },
  (t) => [uniqueIndex("brokers_user_name").on(t.userId, t.name)],
);

/**
 * User-defined prop firm rule template. Rules are configurable because firm
 * policies change — nothing here is treated as universally current.
 */
export const propFirms = pgTable(
  "prop_firms",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    startingBalance: money("starting_balance"),
    profitTarget: money("profit_target"),
    maxDrawdown: money("max_drawdown"),
    drawdownType: drawdownType("drawdown_type").notNull().default("STATIC"),
    dailyLossLimit: money("daily_loss_limit"),
    /** Max share of total profit one day may contribute (0.5 = 50%) */
    consistencyRule: numeric("consistency_rule", { precision: 5, scale: 4, mode: "number" }),
    minTradingDays: integer("min_trading_days"),
    payoutRules: text("payout_rules"),
    scalingRules: text("scaling_rules"),
    ...timestamps,
  },
  (t) => [uniqueIndex("prop_firms_user_name").on(t.userId, t.name)],
);

export const accountGroups = pgTable(
  "account_groups",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("account_groups_user_name").on(t.userId, t.name)],
);

export type FeeRate = {
  commission: number;
  exchange: number;
  clearing: number;
  regulatory: number;
  other: number;
};

/** Per-contract, per-side fee schedule applied to executions that arrive without fees. */
export const feeSchedules = pgTable(
  "fee_schedules",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    /** Instrument root symbol -> rate. "*" is the fallback. */
    rates: jsonb("rates").$type<Record<string, FeeRate>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("fee_schedules_user_name").on(t.userId, t.name)],
);

export const tradingAccounts = pgTable(
  "trading_accounts",
  {
    id: id(),
    userId: userRef(),
    groupId: uuid("group_id").references(() => accountGroups.id, { onDelete: "set null" }),
    brokerId: uuid("broker_id").references(() => brokers.id, { onDelete: "set null" }),
    propFirmId: uuid("prop_firm_id").references(() => propFirms.id, { onDelete: "set null" }),
    feeScheduleId: uuid("fee_schedule_id").references(() => feeSchedules.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** Account identifier as it appears in broker exports */
    externalId: text("external_id"),
    type: accountType("type").notNull().default("PERSONAL"),
    status: accountStatus("status").notNull().default("ACTIVE"),
    currency: text("currency").notNull().default("USD"),
    startingBalance: money("starting_balance").notNull().default(0),
    maxDrawdown: money("max_drawdown"),
    drawdownType: drawdownType("drawdown_type").notNull().default("STATIC"),
    dailyLossLimit: money("daily_loss_limit"),
    profitTarget: money("profit_target"),
    minTradingDays: integer("min_trading_days"),
    consistencyRule: numeric("consistency_rule", { precision: 5, scale: 4, mode: "number" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trading_accounts_user_name").on(t.userId, t.name),
    index("trading_accounts_user_status").on(t.userId, t.status),
  ],
);

// ───────────────────────────── instruments ─────────────────────────────

/**
 * Contract specifications. userId NULL = built-in default. A user row with the
 * same symbol overrides the default for that user.
 */
export const instruments = pgTable(
  "instruments",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    assetClass: text("asset_class").notNull().default("Futures"),
    tickSize: numeric("tick_size", { precision: 18, scale: 8, mode: "number" }).notNull(),
    tickValue: numeric("tick_value", { precision: 14, scale: 4, mode: "number" }).notNull(),
    pointValue: numeric("point_value", { precision: 14, scale: 4, mode: "number" }).notNull(),
    multiplier: numeric("multiplier", { precision: 14, scale: 4, mode: "number" }).notNull().default(1),
    currency: text("currency").notNull().default("USD"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("instruments_user_symbol").on(t.userId, t.symbol).where(sql`${t.userId} is not null`),
    uniqueIndex("instruments_default_symbol").on(t.symbol).where(sql`${t.userId} is null`),
  ],
);

// ───────────────────────────── executions & trades ─────────────────────────────

/** A single fill. Trades are reconstructed from executions — one execution never implies one trade. */
export const executions = pgTable(
  "executions",
  {
    id: id(),
    userId: userRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    /** Contract as traded, e.g. NQZ6 */
    contract: text("contract").notNull(),
    side: side("side").notNull(),
    quantity: integer("quantity").notNull(),
    price: price("price").notNull(),
    executedAt: ts("executed_at").notNull(),
    /** Tie-breaker for fills sharing a timestamp (file order) */
    sequence: integer("sequence").notNull().default(0),
    commission: money("commission").notNull().default(0),
    exchangeFees: money("exchange_fees").notNull().default(0),
    clearingFees: money("clearing_fees").notNull().default(0),
    regulatoryFees: money("regulatory_fees").notNull().default(0),
    otherFees: money("other_fees").notNull().default(0),
    externalId: text("external_id"),
    orderId: text("order_id"),
    /** Deterministic hash of identifying fields, used for duplicate detection */
    fingerprint: text("fingerprint").notNull(),
    source: executionSource("source").notNull().default("MANUAL"),
    importJobId: uuid("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("executions_stream").on(t.userId, t.accountId, t.contract, t.executedAt),
    index("executions_fingerprint").on(t.accountId, t.fingerprint),
    index("executions_external").on(t.accountId, t.externalId),
  ],
);

export const strategies = pgTable(
  "strategies",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    description: text("description"),
    timeframe: text("timeframe"),
    market: text("market"),
    sessions: text("sessions"),
    entryRules: text("entry_rules"),
    stopRules: text("stop_rules"),
    targetRules: text("target_rules"),
    riskRules: text("risk_rules"),
    conditions: text("conditions"),
    color: text("color").notNull().default("#7c8cff"),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("strategies_user_name").on(t.userId, t.name)],
);

export const setups = pgTable(
  "setups",
  {
    id: id(),
    userId: userRef(),
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("setups_user_name").on(t.userId, t.name)],
);

export const trades = pgTable(
  "trades",
  {
    id: id(),
    userId: userRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    contract: text("contract").notNull(),
    direction: direction("direction").notNull(),
    status: tradeStatus("status").notNull(),
    result: tradeResult("result").notNull(),
    openedAt: ts("opened_at").notNull(),
    closedAt: ts("closed_at"),
    /** Execution that opened the trade; used to keep journal data stable across re-reconstruction */
    anchorExecutionId: uuid("anchor_execution_id"),
    maxQuantity: integer("max_quantity").notNull(),
    entryQuantity: integer("entry_quantity").notNull(),
    exitQuantity: integer("exit_quantity").notNull(),
    avgEntryPrice: price("avg_entry_price").notNull(),
    avgExitPrice: price("avg_exit_price"),
    grossPnl: money("gross_pnl").notNull(),
    commission: money("commission").notNull().default(0),
    exchangeFees: money("exchange_fees").notNull().default(0),
    clearingFees: money("clearing_fees").notNull().default(0),
    regulatoryFees: money("regulatory_fees").notNull().default(0),
    otherFees: money("other_fees").notNull().default(0),
    totalFees: money("total_fees").notNull().default(0),
    netPnl: money("net_pnl").notNull(),
    durationSec: integer("duration_sec"),

    // Risk
    initialRisk: money("initial_risk"),
    initialStop: price("initial_stop"),
    target: price("target"),
    rMultiple: numeric("r_multiple", { precision: 10, scale: 4, mode: "number" }),
    /** Only populated from real price data — never estimated */
    mae: money("mae"),
    mfe: money("mfe"),

    // Setup
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    setupId: uuid("setup_id").references(() => setups.id, { onDelete: "set null" }),
    entryModel: text("entry_model"),
    marketCondition: text("market_condition"),
    timeframe: text("timeframe"),

    // Psychology (1–10)
    confidenceBefore: integer("confidence_before"),
    confidenceAfter: integer("confidence_after"),
    emotion: text("emotion"),
    stressLevel: integer("stress_level"),
    patience: integer("patience"),
    focus: integer("focus"),
    executionQuality: integer("execution_quality"),

    notes: text("notes"),
    reviewed: boolean("reviewed").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("trades_user_closed").on(t.userId, t.closedAt),
    index("trades_user_opened").on(t.userId, t.openedAt),
    index("trades_user_account_closed").on(t.userId, t.accountId, t.closedAt),
    index("trades_user_instrument").on(t.userId, t.instrumentId),
    index("trades_user_strategy").on(t.userId, t.strategyId),
    index("trades_user_result").on(t.userId, t.result),
    index("trades_stream").on(t.accountId, t.contract, t.openedAt),
  ],
);

/** Links an execution (or part of one, for reversals) to a trade. */
export const tradeFills = pgTable(
  "trade_fills",
  {
    id: id(),
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    role: fillRole("role").notNull(),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (t) => [index("trade_fills_trade").on(t.tradeId), index("trade_fills_execution").on(t.executionId)],
);

// ───────────────────────────── tagging ─────────────────────────────

/** A user taxonomy: "Confirmation", "Entry", "Market condition", "Mistakes", ... */
export const tagCategories = pgTable(
  "tag_categories",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    /** System categories (e.g. "mistakes") cannot be deleted */
    systemKey: text("system_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("tag_categories_user_name").on(t.userId, t.name)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    userId: userRef(),
    categoryId: uuid("category_id").references(() => tagCategories.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    color: text("color").notNull().default("#8a93a6"),
    ...timestamps,
  },
  (t) => [uniqueIndex("tags_user_category_name").on(t.userId, t.categoryId, t.name), index("tags_user").on(t.userId)],
);

export const tradeTags = pgTable(
  "trade_tags",
  {
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tagId] }), index("trade_tags_tag").on(t.tagId)],
);

// ───────────────────────────── sessions ─────────────────────────────

/** Session windows as wall-clock minutes in `timezone`. endMinute < startMinute wraps past midnight. */
export const tradingSessions = pgTable(
  "trading_sessions",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    color: text("color").notNull().default("#7c8cff"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("trading_sessions_user_name").on(t.userId, t.name)],
);

// ───────────────────────────── journal ─────────────────────────────

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    userId: userRef(),
    date: date("date", { mode: "string" }).notNull(),
    preMarketPlan: text("pre_market_plan"),
    marketBias: text("market_bias"),
    keyLevels: text("key_levels"),
    expectedScenarios: text("expected_scenarios"),
    actualBehavior: text("actual_behavior"),
    emotionalState: text("emotional_state"),
    mistakes: text("mistakes"),
    lessons: text("lessons"),
    postMarketReview: text("post_market_review"),
    tomorrowFocus: text("tomorrow_focus"),
    ...timestamps,
  },
  (t) => [uniqueIndex("journal_entries_user_date").on(t.userId, t.date)],
);

export const dailyReviews = pgTable(
  "daily_reviews",
  {
    id: id(),
    userId: userRef(),
    date: date("date", { mode: "string" }).notNull(),
    notes: text("notes"),
    goals: text("goals"),
    mistakes: text("mistakes"),
    review: text("review"),
    rating: integer("rating"),
    ...timestamps,
  },
  (t) => [uniqueIndex("daily_reviews_user_date").on(t.userId, t.date)],
);

export const playbooks = pgTable(
  "playbooks",
  {
    id: id(),
    userId: userRef(),
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    /** Optional narrower scope: statistics use strategy AND setup when set */
    setupId: uuid("setup_id").references(() => setups.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    rules: text("rules"),
    idealConditions: text("ideal_conditions"),
    invalidConditions: text("invalid_conditions"),
    stopPlacement: text("stop_placement"),
    targetRules: text("target_rules"),
    ...timestamps,
  },
  (t) => [uniqueIndex("playbooks_user_name").on(t.userId, t.name)],
);

/** Trades the user pins to a playbook as reference examples. */
export const playbookExamples = pgTable(
  "playbook_examples",
  {
    id: id(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("playbook_examples_unique").on(t.playbookId, t.tradeId)],
);

export type ChecklistItem = { id: string; label: string };

export const checklists = pgTable("checklists", {
  id: id(),
  userId: userRef(),
  playbookId: uuid("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  items: jsonb("items").$type<ChecklistItem[]>().notNull().default([]),
  /** When true, manually entered trades must complete this checklist before saving */
  required: boolean("required").notNull().default(false),
  ...timestamps,
});

export const checklistResponses = pgTable(
  "checklist_responses",
  {
    id: id(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<Record<string, boolean>>().notNull().default({}),
    /** Every item checked at the time of saving (denormalised for analytics) */
    completed: boolean("completed").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("checklist_responses_unique").on(t.checklistId, t.tradeId)],
);

export const screenshots = pgTable(
  "screenshots",
  {
    id: id(),
    userId: userRef(),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "cascade" }),
    dailyReviewId: uuid("daily_review_id").references(() => dailyReviews.id, { onDelete: "cascade" }),
    kind: screenshotKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: text("caption"),
    ...timestamps,
  },
  (t) => [index("screenshots_user_trade").on(t.userId, t.tradeId)],
);

export const annotations = pgTable("annotations", {
  id: id(),
  screenshotId: uuid("screenshot_id")
    .notNull()
    .references(() => screenshots.id, { onDelete: "cascade" }),
  /** line | rect | arrow | text | entry | exit */
  type: text("type").notNull(),
  /** Normalized (0–1) geometry + style */
  data: jsonb("data").notNull(),
  ...timestamps,
});

export const tradingPlans = pgTable("trading_plans", {
  id: id(),
  userId: userRef().unique(),
  sections: jsonb("sections").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

// ───────────────────────────── imports ─────────────────────────────

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    userId: userRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    rowKind: importRowKind("row_kind").notNull(),
    status: importStatus("status").notNull().default("PREVIEW"),
    timezone: text("timezone").notNull(),
    mapping: jsonb("mapping").$type<Record<string, string | null>>().notNull(),
    duplicateStrategy: duplicateStrategy("duplicate_strategy").notNull().default("SKIP"),
    /** Normalized executions awaiting confirmation; cleared after processing */
    payload: jsonb("payload"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    invalidRows: integer("invalid_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    importedExecutions: integer("imported_executions").notNull().default(0),
    mergedExecutions: integer("merged_executions").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    tradesAffected: integer("trades_affected").notNull().default(0),
    failureMessage: text("failure_message"),
    completedAt: ts("completed_at"),
    ...timestamps,
  },
  (t) => [index("import_jobs_user_created").on(t.userId, t.createdAt)],
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: id(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    field: text("field"),
    message: text("message").notNull(),
    ...timestamps,
  },
  (t) => [index("import_errors_job").on(t.importJobId)],
);

// ───────────────────────────── relations ─────────────────────────────

export const tradingAccountsRelations = relations(tradingAccounts, ({ one, many }) => ({
  group: one(accountGroups, { fields: [tradingAccounts.groupId], references: [accountGroups.id] }),
  broker: one(brokers, { fields: [tradingAccounts.brokerId], references: [brokers.id] }),
  propFirm: one(propFirms, { fields: [tradingAccounts.propFirmId], references: [propFirms.id] }),
  feeSchedule: one(feeSchedules, { fields: [tradingAccounts.feeScheduleId], references: [feeSchedules.id] }),
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one, many }) => ({
  account: one(tradingAccounts, { fields: [trades.accountId], references: [tradingAccounts.id] }),
  instrument: one(instruments, { fields: [trades.instrumentId], references: [instruments.id] }),
  strategy: one(strategies, { fields: [trades.strategyId], references: [strategies.id] }),
  setup: one(setups, { fields: [trades.setupId], references: [setups.id] }),
  fills: many(tradeFills),
  tags: many(tradeTags),
  screenshots: many(screenshots),
}));

export const tradeFillsRelations = relations(tradeFills, ({ one }) => ({
  trade: one(trades, { fields: [tradeFills.tradeId], references: [trades.id] }),
  execution: one(executions, { fields: [tradeFills.executionId], references: [executions.id] }),
}));

export const tradeTagsRelations = relations(tradeTags, ({ one }) => ({
  trade: one(trades, { fields: [tradeTags.tradeId], references: [trades.id] }),
  tag: one(tags, { fields: [tradeTags.tagId], references: [tags.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  category: one(tagCategories, { fields: [tags.categoryId], references: [tagCategories.id] }),
  trades: many(tradeTags),
}));

export const tagCategoriesRelations = relations(tagCategories, ({ many }) => ({ tags: many(tags) }));

export const executionsRelations = relations(executions, ({ one, many }) => ({
  account: one(tradingAccounts, { fields: [executions.accountId], references: [tradingAccounts.id] }),
  instrument: one(instruments, { fields: [executions.instrumentId], references: [instruments.id] }),
  fills: many(tradeFills),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  account: one(tradingAccounts, { fields: [importJobs.accountId], references: [tradingAccounts.id] }),
  errors: many(importErrors),
}));

export const importErrorsRelations = relations(importErrors, ({ one }) => ({
  job: one(importJobs, { fields: [importErrors.importJobId], references: [importJobs.id] }),
}));

export const strategiesRelations = relations(strategies, ({ many }) => ({ trades: many(trades), setups: many(setups) }));
export const setupsRelations = relations(setups, ({ one }) => ({
  strategy: one(strategies, { fields: [setups.strategyId], references: [strategies.id] }),
}));

export const screenshotsRelations = relations(screenshots, ({ one, many }) => ({
  trade: one(trades, { fields: [screenshots.tradeId], references: [trades.id] }),
  annotations: many(annotations),
}));

export const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  strategy: one(strategies, { fields: [playbooks.strategyId], references: [strategies.id] }),
  setup: one(setups, { fields: [playbooks.setupId], references: [setups.id] }),
  examples: many(playbookExamples),
  checklists: many(checklists),
}));
export const playbookExamplesRelations = relations(playbookExamples, ({ one }) => ({
  playbook: one(playbooks, { fields: [playbookExamples.playbookId], references: [playbooks.id] }),
  trade: one(trades, { fields: [playbookExamples.tradeId], references: [trades.id] }),
}));
export const checklistsRelations = relations(checklists, ({ one, many }) => ({
  playbook: one(playbooks, { fields: [checklists.playbookId], references: [playbooks.id] }),
  responses: many(checklistResponses),
}));
