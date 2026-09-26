CREATE TYPE "public"."account_status" AS ENUM('EVALUATION', 'FUNDED', 'ACTIVE', 'INACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('PERSONAL', 'PROP_EVALUATION', 'PROP_FUNDED', 'SIMULATED');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('LONG', 'SHORT');--> statement-breakpoint
CREATE TYPE "public"."drawdown_type" AS ENUM('STATIC', 'TRAILING_EOD', 'TRAILING_INTRADAY');--> statement-breakpoint
CREATE TYPE "public"."duplicate_strategy" AS ENUM('SKIP', 'IMPORT', 'MERGE');--> statement-breakpoint
CREATE TYPE "public"."execution_source" AS ENUM('MANUAL', 'CSV', 'API', 'DEMO');--> statement-breakpoint
CREATE TYPE "public"."fill_role" AS ENUM('ENTRY', 'EXIT');--> statement-breakpoint
CREATE TYPE "public"."import_row_kind" AS ENUM('EXECUTIONS', 'ROUND_TRIPS');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('PREVIEW', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."screenshot_kind" AS ENUM('BEFORE', 'ENTRY', 'EXIT', 'POST', 'DAILY', 'PLAYBOOK', 'STRATEGY');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."trade_result" AS ENUM('WIN', 'LOSS', 'BREAKEVEN', 'OPEN');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screenshot_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"playbook_id" uuid,
	"name" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"goals" text,
	"mistakes" text,
	"review" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"contract" text NOT NULL,
	"side" "side" NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"commission" numeric(14, 2) DEFAULT 0 NOT NULL,
	"exchange_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"clearing_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"regulatory_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"other_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"external_id" text,
	"order_id" text,
	"fingerprint" text NOT NULL,
	"source" "execution_source" DEFAULT 'MANUAL' NOT NULL,
	"import_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"field" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"row_kind" "import_row_kind" NOT NULL,
	"status" "import_status" DEFAULT 'PREVIEW' NOT NULL,
	"timezone" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"duplicate_strategy" "duplicate_strategy" DEFAULT 'SKIP' NOT NULL,
	"payload" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"imported_executions" integer DEFAULT 0 NOT NULL,
	"merged_executions" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"trades_affected" integer DEFAULT 0 NOT NULL,
	"failure_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"exchange" text NOT NULL,
	"asset_class" text DEFAULT 'Futures' NOT NULL,
	"tick_size" numeric(18, 8) NOT NULL,
	"tick_value" numeric(14, 4) NOT NULL,
	"point_value" numeric(14, 4) NOT NULL,
	"multiplier" numeric(14, 4) DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"pre_market_plan" text,
	"market_bias" text,
	"key_levels" text,
	"expected_scenarios" text,
	"actual_behavior" text,
	"emotional_state" text,
	"mistakes" text,
	"lessons" text,
	"post_market_review" text,
	"tomorrow_focus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"rules" text,
	"ideal_conditions" text,
	"invalid_conditions" text,
	"stop_placement" text,
	"target_rules" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starting_balance" numeric(14, 2),
	"profit_target" numeric(14, 2),
	"max_drawdown" numeric(14, 2),
	"drawdown_type" "drawdown_type" DEFAULT 'STATIC' NOT NULL,
	"daily_loss_limit" numeric(14, 2),
	"consistency_rule" numeric(5, 4),
	"min_trading_days" integer,
	"payout_rules" text,
	"scaling_rules" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trade_id" uuid,
	"daily_review_id" uuid,
	"kind" "screenshot_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"timeframe" text,
	"market" text,
	"sessions" text,
	"entry_rules" text,
	"stop_rules" text,
	"target_rules" text,
	"risk_rules" text,
	"conditions" text,
	"color" text DEFAULT '#7c8cff' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#8a93a6' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_fills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"role" "fill_role" NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_tags" (
	"trade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_tags_trade_id_tag_id_pk" PRIMARY KEY("trade_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"contract" text NOT NULL,
	"direction" "direction" NOT NULL,
	"status" "trade_status" NOT NULL,
	"result" "trade_result" NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"anchor_execution_id" uuid,
	"max_quantity" integer NOT NULL,
	"entry_quantity" integer NOT NULL,
	"exit_quantity" integer NOT NULL,
	"avg_entry_price" numeric(18, 6) NOT NULL,
	"avg_exit_price" numeric(18, 6),
	"gross_pnl" numeric(14, 2) NOT NULL,
	"commission" numeric(14, 2) DEFAULT 0 NOT NULL,
	"exchange_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"clearing_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"regulatory_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"other_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net_pnl" numeric(14, 2) NOT NULL,
	"duration_sec" integer,
	"initial_risk" numeric(14, 2),
	"initial_stop" numeric(18, 6),
	"target" numeric(18, 6),
	"r_multiple" numeric(10, 4),
	"mae" numeric(14, 2),
	"mfe" numeric(14, 2),
	"strategy_id" uuid,
	"setup_id" uuid,
	"entry_model" text,
	"market_condition" text,
	"timeframe" text,
	"confidence_before" integer,
	"confidence_after" integer,
	"emotion" text,
	"stress_level" integer,
	"patience" integer,
	"focus" integer,
	"execution_quality" integer,
	"notes" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"broker_id" uuid,
	"prop_firm_id" uuid,
	"fee_schedule_id" uuid,
	"name" text NOT NULL,
	"external_id" text,
	"type" "account_type" DEFAULT 'PERSONAL' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"starting_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"max_drawdown" numeric(14, 2),
	"drawdown_type" "drawdown_type" DEFAULT 'STATIC' NOT NULL,
	"daily_loss_limit" numeric(14, 2),
	"profit_target" numeric(14, 2),
	"min_trading_days" integer,
	"consistency_rule" numeric(5, 4),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_plans_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "trading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"color" text DEFAULT '#7c8cff' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_screenshot_id_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."screenshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reviews" ADD CONSTRAINT "daily_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firms" ADD CONSTRAINT "prop_firms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_daily_review_id_daily_reviews_id_fk" FOREIGN KEY ("daily_review_id") REFERENCES "public"."daily_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_categories" ADD CONSTRAINT "tag_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_category_id_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tag_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_fills" ADD CONSTRAINT "trade_fills_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_fills" ADD CONSTRAINT "trade_fills_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_fee_schedule_id_fee_schedules_id_fk" FOREIGN KEY ("fee_schedule_id") REFERENCES "public"."fee_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_plans" ADD CONSTRAINT "trading_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_sessions" ADD CONSTRAINT "trading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_user_name" ON "account_groups" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "brokers_user_name" ON "brokers" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_responses_unique" ON "checklist_responses" USING btree ("checklist_id","trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reviews_user_date" ON "daily_reviews" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "executions_stream" ON "executions" USING btree ("user_id","account_id","contract","executed_at");--> statement-breakpoint
CREATE INDEX "executions_fingerprint" ON "executions" USING btree ("account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "executions_external" ON "executions" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_schedules_user_name" ON "fee_schedules" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "import_errors_job" ON "import_errors" USING btree ("import_job_id");--> statement-breakpoint
CREATE INDEX "import_jobs_user_created" ON "import_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_user_symbol" ON "instruments" USING btree ("user_id","symbol") WHERE "instruments"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_default_symbol" ON "instruments" USING btree ("symbol") WHERE "instruments"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_user_date" ON "journal_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_firms_user_name" ON "prop_firms" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "screenshots_user_trade" ON "screenshots" USING btree ("user_id","trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "setups_user_name" ON "setups" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_user_name" ON "strategies" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_categories_user_name" ON "tag_categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_category_name" ON "tags" USING btree ("user_id","category_id","name");--> statement-breakpoint
CREATE INDEX "tags_user" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_fills_trade" ON "trade_fills" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "trade_fills_execution" ON "trade_fills" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "trade_tags_tag" ON "trade_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "trades_user_closed" ON "trades" USING btree ("user_id","closed_at");--> statement-breakpoint
CREATE INDEX "trades_user_opened" ON "trades" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "trades_user_account_closed" ON "trades" USING btree ("user_id","account_id","closed_at");--> statement-breakpoint
CREATE INDEX "trades_user_instrument" ON "trades" USING btree ("user_id","instrument_id");--> statement-breakpoint
CREATE INDEX "trades_user_strategy" ON "trades" USING btree ("user_id","strategy_id");--> statement-breakpoint
CREATE INDEX "trades_user_result" ON "trades" USING btree ("user_id","result");--> statement-breakpoint
CREATE INDEX "trades_stream" ON "trades" USING btree ("account_id","contract","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_user_name" ON "trading_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "trading_accounts_user_status" ON "trading_accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_sessions_user_name" ON "trading_sessions" USING btree ("user_id","name");