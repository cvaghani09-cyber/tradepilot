# TradePilot

A futures trading journal and performance-analytics web app. You import broker fills or completed trades, TradePilot rebuilds them into trades with tick-accurate P&L, and then you can journal each trade and analyze results by setup, session, time, instrument and risk.

> Every statistic describes **your past trades** under the filters you select. None of it predicts future results.

## Status

The build covers phases 1–4 of the spec. Sections that aren't built yet are marked "Soon" in the app and have their own page saying what's planned. There are no placeholder buttons that do nothing.

| Area | Status |
|---|---|
| Auth (email/password, JWT sessions), user-level data isolation | ✅ |
| Design system, app shell, dark/light themes, ⌘/Ctrl+K search | ✅ |
| Accounts, groups, fee schedules, prop-firm rules, account health panel | ✅ |
| Instrument spec database (defaults + user overrides/custom) | ✅ |
| Executions → trades reconstruction (scale in/out, partials, reversals, open/overnight) | ✅ |
| Manual trade entry | ✅ |
| CSV import: detect → map → preview → errors → duplicates (skip/merge/import) → transactional commit → report | ✅ |
| Trades table: server pagination, sort, search, filters, column chooser, bulk tag/strategy/reviewed/delete, CSV export | ✅ |
| Trade detail: stats, fill timeline, executions, setup, risk/R, psychology, mistakes, tags, notes | ✅ |
| Global filter bar, persisted across pages (URL + local storage) | ✅ |
| Dashboard (customizable widgets), calendar heatmap with daily review, analytics (9 views + insights) | ✅ |
| Strategies & setups with per-strategy performance; custom tag taxonomies | ✅ |
| Demo workspace (separate user, clearly labelled) | ✅ |
| Screenshots + annotation, rich-text editor | ⏳ Phase 6 (schema in place, UI says "Not built yet") |
| Journal page, playbook, checklists, trading plan | ⏳ Phase 5–6 |
| Reports & PDF export | ⏳ Phase 7 (CSV export of trades works today) |
| MFE/MAE, candlestick trade chart | ⏳ Needs a market-data source. Values are never estimated. |
| Broker/prop-firm API sync | ⏳ Only where official APIs exist |

## Stack

Next.js 15 (App Router, server actions) · React 19 · TypeScript · Tailwind v4 · shadcn-style primitives on Radix · Lucide · Recharts · **PostgreSQL + Drizzle ORM** · Auth.js v5 · Zod · Vitest · Playwright.

**Why Drizzle instead of Prisma:** the build environment couldn't download Prisma's engine binaries. Without them, no migrations or database tests could run, and untested database code doesn't meet the definition of done. Drizzle is pure TypeScript, has no binaries, runs on Vercel, and fits the heavy SQL aggregation the analytics engine does. The schema in `db/schema.ts` covers every model the spec lists.

## Getting started

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate                 # apply SQL migrations in db/migrations
pnpm db:seed                    # optional: demo workspace (demo@tradepilot.local)
pnpm dev
```

On the sign-in page, **Explore the demo workspace** logs into the seeded demo user. The demo is a separate account, so its data never mixes with real accounts.

### Scripts

| Script | What it does |
|---|---|
| `pnpm db:generate` | Generate a new SQL migration from `db/schema.ts` |
| `pnpm db:migrate` | Apply migrations (run this in CI/CD before deploying) |
| `pnpm db:seed` | (Re)create the demo workspace |
| `pnpm test` | Unit + integration tests (needs a Postgres database, `TEST_DATABASE_URL`, default `tradepilot_test`) |
| `pnpm test:e2e` | Playwright end-to-end tests (starts `pnpm dev` if nothing is running) |
| `pnpm tsx scripts/bench.ts` | Times the main queries on 100,000 synthetic trades |

## Architecture

```
app/                 routes (App Router). (auth)/ and (app)/ groups, api/ route handlers
app/actions/         server actions: auth → Zod validation → service → cache invalidation
components/          UI. ui/ primitives, then feature folders (trades, import, charts, …)
db/                  Drizzle schema, client, SQL migrations
lib/calculations/    pure, unit-tested domain math (P&L, fees, R, metrics, drawdown, reconstruction, dedupe)
lib/importers/       CSV column detection, value/timestamp parsing, row normalization
lib/analytics/       filter model, SQL where-builder, cached analytics wrappers, insights
lib/auth/            password hashing, rate limiting, session helpers
services/            data access + business rules; every function takes userId explicitly
tests/               unit/, integration/ (real Postgres), e2e/ (Playwright), fixtures/
```

Key rules:

* **Business logic lives outside UI components.** `lib/calculations` is pure. `services/*` does the database work.
* **Every query is scoped by `userId`.** Foreign keys a user sends (strategy, setup, tag, account ids) are checked for ownership before they're written. Integration tests try cross-user reads and writes and expect `NOT_FOUND`.
* **Trades are derived from executions.** `services/reconstruction.ts` rebuilds a whole (account, contract) stream inside the import transaction. Existing trades are matched by their opening execution, so notes, tags and risk survive re-imports.
* **P&L comes from instrument metadata:** ticks × tick value × contracts, using average-cost realization. Nothing assumes all contracts are alike.
* **Analytics run in SQL** (aggregates, `percentile_cont`, `stddev_samp`, grouped time buckets). Order-dependent stats (streaks, drawdown) use a lean ordered projection on the server. Results are cached per user + filters and invalidated by tag on any write. With 100k trades, every uncached query took under 0.5 s in the bench.
* **Errors:** services throw `AppError` with a user-facing message. Anything unexpected is logged and replaced with a generic message, so raw database errors never reach the UI.

### Conventions worth knowing

* Date range, calendar and weekday use the **close** (realized) time in the user's time zone. Hour, 15/30-minute buckets and sessions use the **entry** time.
* Sessions are user-editable windows in any IANA zone. Windows can overlap and can wrap past midnight.
* Prop-firm rules are entered per account. Nothing about any firm is hard-coded. Health uses realized P&L only. "Trailing intraday" is approximated from realized closes and is labelled as such.
* "Breakeven" means net P&L of exactly $0.00 after fees.

## Security notes

* Auth.js credentials provider with bcrypt (cost 12), JWT sessions, and middleware-protected routes. Server actions have Next's built-in origin check (CSRF).
* Zod validation on every action. Consistent `{ ok, data } | { ok, error: { code, message, fieldErrors } }` results.
* The rate limiter (`lib/auth/rate-limit.ts`) is **in-memory, per instance**. On serverless, swap its store for Redis/Upstash (the interface stays the same).
* The time zone is inlined into SQL only after IANA-name validation (`tzLit`). All other values are bound parameters.
* Security headers are set in `next.config.ts`.
* Requesting another user's trade id renders the not-found page. Because pages stream, the HTTP status stays 200, but no data is sent.

## Deploying (Vercel)

1. Create a Postgres database (Neon, Supabase, RDS…). If you use a transaction pooler, the client already sets `prepare: false`.
2. Set `DATABASE_URL`, `AUTH_SECRET` and `AUTH_TRUST_HOST=true`.
3. Run `pnpm db:migrate` against the database, either as a build step or from CI.
4. Storage (`STORAGE_DRIVER=s3` + `S3_*`) will be used by screenshot uploads when phase 6 lands.
