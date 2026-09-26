/**
 * Demo workspace seed.
 *
 * Creates (or resets) a SEPARATE demo user whose data is generated, clearly
 * labelled, and never mixed with real accounts. Prices are synthetic — this is
 * sample data for exploring the product, not market data.
 *
 *   pnpm db:seed
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db, schema, sqlClient } from "@/db";
import { registerUser } from "@/services/users";
import { createAccount } from "@/services/accounts";
import { createStrategy, createSetup } from "@/services/strategies";
import { createPlaybook, addPlaybookExample } from "@/services/playbooks";
import { createChecklist, saveChecklistResponse } from "@/services/checklists";
import { saveTradingPlan } from "@/services/trading-plan";
import { InstrumentResolver, ensureDefaultInstruments } from "@/services/instruments";
import { rebuildStreams } from "@/services/reconstruction";
import { batchFingerprints } from "@/lib/calculations/dedupe";
import { rMultiple } from "@/lib/calculations/r-multiple";
import { round2 } from "@/lib/calculations/money";

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@tradepilot.local";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo-password-not-secret";
const TZ = "America/New_York";

// Deterministic PRNG so the demo is reproducible
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260926);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const between = (a: number, b: number) => a + rand() * (b - a);
const tick = (p: number, size = 0.25) => Math.round(p / size) * size;
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

type StrategyProfile = { id: string; setupIds: string[]; winRate: number; winR: [number, number]; sessions: [number, number][] };

async function main() {
  await ensureDefaultInstruments();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
  if (existing) {
    if (!existing.isDemo) throw new Error(`${DEMO_EMAIL} belongs to a real user — refusing to overwrite.`);
    await db.delete(schema.users).where(eq(schema.users.id, existing.id));
  }
  const user = await registerUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo Trader", isDemo: true });
  const uid = user.id;

  const nqFees = { commission: 1.29, exchange: 1.38, clearing: 0.1, regulatory: 0.02, other: 0 };
  const mnqFees = { commission: 0.39, exchange: 0.35, clearing: 0.05, regulatory: 0.02, other: 0 };
  const feeRates = { NQ: nqFees, MNQ: mnqFees, "*": nqFees };

  const accts = [
    await createAccount(uid, {
      name: "Demo Prop 50K · Eval",
      groupName: "Demo Prop Firm",
      brokerName: "Demo Broker",
      externalId: "DEMO-EVAL-01",
      type: "PROP_EVALUATION",
      status: "EVALUATION",
      currency: "USD",
      startingBalance: 50000,
      profitTarget: 3000,
      maxDrawdown: 2000,
      drawdownType: "TRAILING_EOD",
      dailyLossLimit: 1000,
      minTradingDays: 5,
      consistencyRule: 0.5,
      feeRates,
    }),
    await createAccount(uid, {
      name: "Demo Prop 50K · Funded",
      groupName: "Demo Prop Firm",
      brokerName: "Demo Broker",
      externalId: "DEMO-FUND-02",
      type: "PROP_FUNDED",
      status: "FUNDED",
      currency: "USD",
      startingBalance: 50000,
      maxDrawdown: 2000,
      drawdownType: "TRAILING_EOD",
      dailyLossLimit: 1000,
      feeRates,
    }),
    await createAccount(uid, {
      name: "Demo Personal",
      brokerName: "Demo Broker",
      externalId: "DEMO-PERS-03",
      type: "PERSONAL",
      status: "ACTIVE",
      currency: "USD",
      startingBalance: 25000,
      drawdownType: "STATIC",
      feeRates,
    }),
  ];

  const smt = await createStrategy(uid, {
    name: "SMT + CISD + FVG",
    description: "Example strategy (editable): SMT divergence between correlated indices, a change in state of delivery, then entry on a fair value gap. Not a recommendation.",
    market: "NQ",
    timeframe: "HTF 1H / 4H · entry 1m–5m",
    sessions: "New York Open, 10:00 AM New York",
    entryRules: "1. HTF draw on liquidity identified\n2. SMT divergence at a key level\n3. CISD confirmed on the execution timeframe\n4. Enter on the first FVG in the new direction",
    stopRules: "Beyond the swing that formed the SMT",
    targetRules: "Opposing liquidity; partial at 1R optional",
    riskRules: "Configurable — e.g. fixed $ risk per trade",
    color: "#8391ff",
  });
  const orb = await createStrategy(uid, { name: "Opening Range Breakout", description: "Break and retest of the first 15-minute range.", market: "NQ", timeframe: "5m", color: "#e3a642" });
  const vwap = await createStrategy(uid, { name: "VWAP Reversion", description: "Fade extended moves back to session VWAP.", market: "MNQ", timeframe: "1m", color: "#5aa2ff" });
  const setupA = await createSetup(uid, { name: "SMT at HTF level", strategyId: smt.id });
  const setupB = await createSetup(uid, { name: "10:00 macro", strategyId: smt.id });
  const setupC = await createSetup(uid, { name: "ORB retest", strategyId: orb.id });
  const setupD = await createSetup(uid, { name: "VWAP 2σ fade", strategyId: vwap.id });

  const profiles: StrategyProfile[] = [
    { id: smt.id, setupIds: [setupA.id, setupB.id], winRate: 0.45, winR: [1.0, 2.3], sessions: [[570, 660], [595, 640]] },
    { id: orb.id, setupIds: [setupC.id], winRate: 0.4, winR: [0.8, 1.9], sessions: [[585, 630]] },
    { id: vwap.id, setupIds: [setupD.id], winRate: 0.52, winR: [0.5, 1.2], sessions: [[660, 900], [180, 420]] },
  ];

  const tagRows = await db.select().from(schema.tags).where(eq(schema.tags.userId, uid));
  const mistakeTags = tagRows.filter((t) => ["FOMO", "Revenge trade", "Early entry", "Moved stop", "Chased price", "Oversizing", "Broke trading plan"].includes(t.name));
  const cats = await db.select().from(schema.tagCategories).where(eq(schema.tagCategories.userId, uid));
  const mc = cats.find((c) => c.name === "Market condition")!;
  const conf = cats.find((c) => c.name === "Confirmation")!;
  const trending = (await db.insert(schema.tags).values({ userId: uid, categoryId: mc.id, name: "Trending", color: "#22a79d" }).returning())[0]!;
  const ranging = (await db.insert(schema.tags).values({ userId: uid, categoryId: mc.id, name: "Ranging", color: "#8a93a6" }).returning())[0]!;
  const cisdTag = (await db.insert(schema.tags).values({ userId: uid, categoryId: conf.id, name: "CISD", color: "#8391ff" }).returning())[0]!;

  const resolver = await InstrumentResolver.load(uid);
  const NQ = resolver.resolve("NQZ6")!;
  const MNQ = resolver.resolve("MNQZ6")!;

  type GenTrade = {
    accountId: string;
    contract: string;
    firstIdx: number;
    risk: number;
    stop: number;
    target: number;
    profile: StrategyProfile;
    setupId: string;
    won: boolean;
    tagIds: string[];
    psych: { confidenceBefore: number; confidenceAfter: number; stressLevel: number; focus: number; patience: number; executionQuality: number; emotion: string };
    notes: string | null;
  };
  const execs: (typeof schema.executions.$inferInsert)[] = [];
  const gen: GenTrade[] = [];
  let price = 19650;

  const today = new Date();
  const start = new Date(today.getTime() - 180 * 86400000);
  for (let d = new Date(start); d < today; d = new Date(d.getTime() + 86400000)) {
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const [Y, M, D] = ymd.split("-").map(Number) as [number, number, number];
    const dow = new TZDate(Y, M - 1, D, 12, 0, 0, TZ).getDay();
    price = tick(price + normal() * 120 + 6);
    if (dow === 0 || dow === 6) continue;
    if (rand() < 0.12) continue; // days off

    for (const acct of accts) {
      if (acct.name.includes("Eval") && rand() < 0.35) continue;
      if (acct.name.includes("Personal") && rand() < 0.5) continue;
      const nTrades = 1 + Math.floor(rand() * (acct.name.includes("Personal") ? 3 : 4));
      let cursorMin = 0;
      for (let k = 0; k < nTrades; k++) {
        const profile = rand() < 0.55 ? profiles[0]! : rand() < 0.6 ? profiles[1]! : profiles[2]!;
        const [s0, s1] = pick(profile.sessions);
        const entryMin = Math.max(Math.round(between(s0, s1)), cursorMin + 3);
        if (entryMin > 1000) break;
        const spec = profile.id === vwap.id ? MNQ : NQ;
        const contract = spec.symbol === "MNQ" ? "MNQZ6" : "NQZ6";
        const qty = spec.symbol === "MNQ" ? pick([2, 3, 4, 5]) : pick([1, 1, 1, 2]);
        const dir = rand() < 0.53 ? 1 : -1;
        const riskPts = tick(between(8, 22));
        const tired = k >= 2; // later trades in a day are a bit worse
        const won = rand() < profile.winRate - (tired ? 0.12 : 0);
        const be = !won && rand() < 0.08;
        const rOut = won ? between(profile.winR[0], profile.winR[1]) : be ? 0 : -between(0.75, 1.2);
        const entry = tick(price + normal() * 20);
        const exit = tick(entry + dir * rOut * riskPts);
        const holdMin = Math.max(1, Math.round(won ? between(4, 45) : between(1, 20)));
        const entryAt = new TZDate(Y, M - 1, D, Math.floor(entryMin / 60), entryMin % 60, Math.floor(rand() * 60), TZ);
        const exitAt = new Date(entryAt.getTime() + holdMin * 60000 + Math.floor(rand() * 50000));
        cursorMin = entryMin + holdMin + 1;

        const entrySide = dir === 1 ? "BUY" : "SELL";
        const exitSide = dir === 1 ? "SELL" : "BUY";
        const firstIdx = execs.length;
        const push = (side: "BUY" | "SELL", q: number, p: number, at: Date, seq: number) => {
          const rate = spec.symbol === "MNQ" ? mnqFees : nqFees;
          execs.push({
            userId: uid,
            accountId: acct.id,
            instrumentId: spec.id,
            contract,
            side,
            quantity: q,
            price: p,
            executedAt: at,
            sequence: seq,
            commission: round2(rate.commission * q),
            exchangeFees: round2(rate.exchange * q),
            clearingFees: round2(rate.clearing * q),
            regulatoryFees: round2(rate.regulatory * q),
            otherFees: 0,
            fingerprint: "",
            source: "DEMO",
          });
        };
        // Scale in (20%) and scale out (30%)
        if (qty >= 2 && rand() < 0.2) {
          push(entrySide, qty - 1, entry, new Date(entryAt.getTime()), 0);
          push(entrySide, 1, tick(entry - dir * riskPts * 0.3), new Date(entryAt.getTime() + 45000), 1);
        } else push(entrySide, qty, entry, new Date(entryAt.getTime()), 0);
        const avgEntryApprox = entry;
        if (qty >= 2 && won && rand() < 0.3) {
          const half = Math.floor(qty / 2);
          push(exitSide, half, tick(avgEntryApprox + dir * riskPts), new Date((entryAt.getTime() + exitAt.getTime()) / 2), 2);
          push(exitSide, qty - half, exit, exitAt, 3);
        } else push(exitSide, qty, exit, exitAt, 2);

        const stop = tick(entry - dir * riskPts);
        const tagIds: string[] = [];
        if (!won && rand() < 0.35) tagIds.push(pick(mistakeTags).id);
        if (tired && rand() < 0.25) tagIds.push(mistakeTags.find((t) => t.name === "Revenge trade")?.id ?? mistakeTags[0]!.id);
        tagIds.push(rand() < 0.6 ? trending.id : ranging.id);
        if (profile.id === smt.id) tagIds.push(cisdTag.id);
        gen.push({
          accountId: acct.id,
          contract,
          firstIdx,
          risk: round2(riskPts * spec.pointValue * qty),
          stop,
          target: tick(entry + dir * riskPts * 2),
          profile,
          setupId: pick(profile.setupIds),
          won,
          tagIds: [...new Set(tagIds)],
          psych: {
            confidenceBefore: Math.min(10, Math.max(1, Math.round(6 + normal() * 1.5))),
            confidenceAfter: Math.min(10, Math.max(1, Math.round((won ? 7 : 5) + normal() * 1.5))),
            stressLevel: Math.min(10, Math.max(1, Math.round((tired ? 6 : 4) + normal() * 1.5))),
            focus: Math.min(10, Math.max(1, Math.round((tired ? 5 : 7) + normal()))),
            patience: Math.min(10, Math.max(1, Math.round(6 + normal() * 1.5))),
            executionQuality: Math.min(10, Math.max(1, Math.round((won ? 7 : 5) + normal() * 1.5))),
            emotion: pick(won ? ["Calm", "Confident", "Focused"] : ["Frustrated", "Anxious", "Calm", "Impatient"]),
          },
          notes: rand() < 0.15 ? pick(["Waited for the displacement before entering.", "Entered before confirmation — should have waited.", "Clean execution, followed the plan.", "News spike; spread widened on exit."]) : null,
        });
      }
    }
  }

  // Fingerprints (prefixed so demo fills can never collide with real imports)
  const fps = batchFingerprints(execs.map((e) => ({ accountId: e.accountId, contract: e.contract, executedAt: e.executedAt as Date, side: e.side, quantity: e.quantity, price: e.price })));
  execs.forEach((e, i) => (e.fingerprint = `demo:${fps[i]}`));

  await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (let c = 0; c < execs.length; c += 1000) {
      const rows = await tx.insert(schema.executions).values(execs.slice(c, c + 1000)).returning({ id: schema.executions.id });
      ids.push(...rows.map((r) => r.id));
    }
    const streams = [...new Set(execs.map((e) => `${e.accountId}|${e.contract}`))].map((k) => {
      const [accountId, contract] = k.split("|") as [string, string];
      return { accountId, contract };
    });
    await rebuildStreams(tx, uid, streams);

    for (const g of gen) {
      const anchor = ids[g.firstIdx]!;
      const [t] = await tx.select().from(schema.trades).where(and(eq(schema.trades.userId, uid), eq(schema.trades.anchorExecutionId, anchor)));
      if (!t) continue;
      await tx
        .update(schema.trades)
        .set({
          strategyId: g.profile.id,
          setupId: g.setupId,
          initialRisk: g.risk,
          initialStop: g.stop,
          target: g.target,
          rMultiple: rMultiple(t.netPnl, g.risk),
          notes: g.notes,
          timeframe: "1m",
          ...g.psych,
          reviewed: rand() < 0.4,
        })
        .where(eq(schema.trades.id, t.id));
      if (g.tagIds.length) await tx.insert(schema.tradeTags).values(g.tagIds.map((tagId) => ({ tradeId: t.id, tagId }))).onConflictDoNothing();
    }
  });

  // ── Playbook, checklist and trading plan (Phase 5) ──
  const pb = await createPlaybook(uid, {
    name: "SMT + CISD + FVG at HTF level",
    strategyId: smt.id,
    setupId: setupA.id,
    description: "Example entry (editable): divergence at a higher-timeframe level, confirmed by a change in state of delivery, entered on the first fair value gap.",
    rules: "1. Mark HTF (1H/4H) levels and the draw on liquidity\n2. Wait for SMT divergence at the level\n3. Require CISD on the execution timeframe\n4. Enter on the first FVG in the new direction",
    idealConditions: "New York Open, clean displacement, liquidity taken just before the SMT",
    invalidConditions: "High-impact news within 15 minutes; no clear HTF level; chop inside the prior day's range",
    stopPlacement: "Beyond the swing that formed the SMT",
    targetRules: "Opposing liquidity; optional partial at 1R",
  });
  const cl = await createChecklist(uid, {
    name: "Before entering",
    playbookId: pb.id,
    required: false,
    items: ["HTF level identified", "Liquidity identified", "SMT confirmed", "CISD confirmed", "FVG identified", "Correct session", "Risk calculated", "Stop placed", "Target defined", "No emotional trading"].map((label) => ({ label })),
  });
  const smtTrades = await db
    .select({ id: schema.trades.id, netPnl: schema.trades.netPnl })
    .from(schema.trades)
    .where(and(eq(schema.trades.userId, uid), eq(schema.trades.strategyId, smt.id)));
  for (const t of smtTrades) {
    if (rand() < 0.35) continue; // no checklist recorded
    const skip = rand() < 0.4 ? cl.items[Math.floor(rand() * cl.items.length)]!.id : null;
    await saveChecklistResponse(uid, t.id, cl.id, Object.fromEntries(cl.items.map((i) => [i.id, i.id !== skip])));
  }
  const sorted = [...smtTrades].sort((a, b) => b.netPnl - a.netPnl);
  for (const t of [...sorted.slice(0, 2), ...sorted.slice(-2)]) await addPlaybookExample(uid, pb.id, t.id, t.netPnl > 0 ? "Clean execution" : "Took it before CISD");
  await saveTradingPlan(uid, {
    markets: "NQ and MNQ only.",
    sessions: "New York Open (09:30–11:00 ET). Occasional London when there's a clear HTF setup.",
    setups: "Only setups in the playbook. No discretionary trades.",
    risk: "Risk 0.5% of the account per trade. Reduce size after two consecutive losses.",
    dailyLossLimit: "1000",
    maxTradesPerDay: "3",
    entryRules: "All checklist items ticked before entry.",
    exitRules: "Stop never moved further away. Take partials at 1R when in profit.",
    noTrade: "15 minutes either side of high-impact news. After hitting the daily loss limit.",
    psychology: "Walk away for 15 minutes after any loss larger than 1R.",
    goals: "Follow the plan on 90% of trading days this month.",
  });

  const [{ n }] = (await sqlClient`select count(*)::int as n from trades where user_id = ${uid}`) as unknown as [{ n: number }];
  console.log(`✓ Demo workspace ready: ${DEMO_EMAIL} (${n} trades across ${accts.length} accounts)`);
  await sqlClient.end();
}

main().catch(async (e) => {
  console.error(e);
  await sqlClient.end();
  process.exit(1);
});
