CREATE TABLE "playbook_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playbook_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "setup_id" uuid;--> statement-breakpoint
ALTER TABLE "playbook_examples" ADD CONSTRAINT "playbook_examples_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_examples" ADD CONSTRAINT "playbook_examples_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_examples_unique" ON "playbook_examples" USING btree ("playbook_id","trade_id");--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_user_name" ON "playbooks" USING btree ("user_id","name");