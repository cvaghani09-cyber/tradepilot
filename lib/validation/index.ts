import { z } from "zod";

const optText = (max = 5000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v.trim() === "" ? null : v));

/** Empty string / null → null; otherwise a finite number. Accepts "1,234.50". */
const optNumber = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v),
  z.number({ error: "Enter a number" }).finite().nullable(),
);
const reqNumber = (msg: string) =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v), z.number({ error: msg }).finite());
const positiveOpt = optNumber.refine((v) => v == null || v > 0, "Must be greater than zero");
const rating = z.number().int().min(1).max(10).nullable().optional();
const uuid = z.string().uuid("Invalid id");

export const registerSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const feeRateSchema = z.object({
  commission: z.number().min(0),
  exchange: z.number().min(0),
  clearing: z.number().min(0),
  regulatory: z.number().min(0),
  other: z.number().min(0),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  externalId: optText(80),
  brokerName: optText(80),
  groupName: optText(80),
  type: z.enum(["PERSONAL", "PROP_EVALUATION", "PROP_FUNDED", "SIMULATED"]),
  status: z.enum(["EVALUATION", "FUNDED", "ACTIVE", "INACTIVE", "CLOSED"]),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
  startingBalance: reqNumber("Starting balance is required").refine((v) => v >= 0, "Can't be negative"),
  maxDrawdown: positiveOpt,
  drawdownType: z.enum(["STATIC", "TRAILING_EOD", "TRAILING_INTRADAY"]),
  dailyLossLimit: positiveOpt,
  profitTarget: positiveOpt,
  minTradingDays: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(365).nullable()),
  consistencyRule: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v) / 100),
    z.number().gt(0, "Must be above 0%").max(1, "Can't exceed 100%").nullable(),
  ),
  notes: optText(2000),
  feeRates: z.record(z.string().max(12), feeRateSchema).nullable().optional(),
});

export const manualTradeSchema = z
  .object({
    accountId: uuid,
    contract: z.string().trim().min(1, "Symbol is required").max(20),
    direction: z.enum(["LONG", "SHORT"]),
    quantity: z.preprocess((v) => Number(v), z.number().int("Whole contracts only").positive("Must be at least 1").max(10000)),
    entryPrice: reqNumber("Entry price is required").refine((v) => v > 0, "Must be greater than zero"),
    exitPrice: positiveOpt,
    entryAt: z.coerce.date({ error: "Entry time is required" }),
    exitAt: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable()),
    commission: optNumber.refine((v) => v == null || v >= 0, "Can't be negative"),
    fees: optNumber.refine((v) => v == null || v >= 0, "Can't be negative"),
    initialRisk: positiveOpt,
    initialStop: positiveOpt,
    target: positiveOpt,
    strategyId: uuid.nullable().optional(),
    setupId: uuid.nullable().optional(),
    notes: optText(20000),
    tagIds: z.array(uuid).max(50).optional(),
    checklists: z.record(uuid, z.record(z.string().max(40), z.boolean())).optional(),
  })
  .refine((v) => (v.exitPrice == null) === (v.exitAt == null), { message: "Provide both exit price and exit time, or neither", path: ["exitPrice"] })
  .refine((v) => !v.exitAt || v.exitAt >= v.entryAt, { message: "Exit must be after entry", path: ["exitAt"] });

export const journalPatchSchema = z
  .object({
    strategyId: uuid.nullable(),
    setupId: uuid.nullable(),
    entryModel: optText(120),
    marketCondition: optText(120),
    timeframe: optText(40),
    initialRisk: positiveOpt,
    initialStop: positiveOpt,
    target: positiveOpt,
    confidenceBefore: rating,
    confidenceAfter: rating,
    emotion: optText(60),
    stressLevel: rating,
    patience: rating,
    focus: rating,
    executionQuality: rating,
    notes: optText(50000),
    reviewed: z.boolean(),
    tagIds: z.array(uuid).max(100),
  })
  .partial();

export const bulkSchema = z.object({
  tradeIds: z.array(uuid).min(1, "Select at least one trade").max(5000),
});

export const strategySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: optText(4000),
  timeframe: optText(60),
  market: optText(60),
  sessions: optText(200),
  entryRules: optText(8000),
  stopRules: optText(8000),
  targetRules: optText(8000),
  riskRules: optText(8000),
  conditions: optText(8000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  categoryId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const sessionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  timezone: z.string().min(1).max(64),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const instrumentSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .regex(/^[A-Za-z0-9]+$/, "Letters and digits only"),
  name: z.string().trim().min(1).max(80),
  exchange: z.string().trim().min(1).max(20),
  tickSize: reqNumber("Tick size is required").refine((v) => v > 0, "Must be greater than zero"),
  tickValue: reqNumber("Tick value is required").refine((v) => v > 0, "Must be greater than zero"),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
});

export const settingsSchema = z.object({
  name: optText(80),
  timezone: z.string().min(1).max(64),
  currency: z.string().trim().length(3).toUpperCase(),
});

export const importPreviewSchema = z.object({
  accountId: uuid,
  fileName: z.string().min(1).max(200),
  kind: z.enum(["EXECUTIONS", "ROUND_TRIPS"]),
  mapping: z.record(z.string(), z.string().max(200).nullable()),
  timezone: z.string().min(1).max(64),
  dateOrder: z.enum(["auto", "MDY", "DMY", "YMD"]),
});

export const importConfirmSchema = z.object({
  jobId: uuid,
  strategy: z.enum(["SKIP", "IMPORT", "MERGE"]),
});

// ───────────────────────────── Phase 5 ─────────────────────────────

export const playbookSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  strategyId: uuid.nullable().optional(),
  setupId: uuid.nullable().optional(),
  description: optText(8000),
  rules: optText(8000),
  idealConditions: optText(8000),
  invalidConditions: optText(8000),
  stopPlacement: optText(8000),
  targetRules: optText(8000),
});

export const checklistSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  playbookId: uuid.nullable().optional(),
  required: z.boolean(),
  items: z
    .array(z.object({ id: z.string().max(40).optional(), label: z.string().max(200) }))
    .max(40, "At most 40 items"),
});

export const checklistAnswersSchema = z.record(z.string().max(40), z.boolean());

export const tradingPlanSchema = z.record(z.string().max(40), z.string().max(20000));
