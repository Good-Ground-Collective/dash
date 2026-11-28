CREATE TABLE "briefing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"snapshot_at" timestamp with time zone,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"prices" jsonb,
	"source_counts" jsonb,
	"paragraphs" jsonb,
	"unknown_refs" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "briefing_trigger_check" CHECK ("briefing"."trigger" in ('scheduled', 'manual')),
	CONSTRAINT "briefing_status_check" CHECK ("briefing"."status" in ('succeeded', 'failed', 'skipped_over_budget')),
	CONSTRAINT "briefing_tokens_check" CHECK ("briefing"."input_tokens" >= 0 and "briefing"."cached_input_tokens" >= 0 and "briefing"."output_tokens" >= 0 and "briefing"."reasoning_tokens" >= 0),
	CONSTRAINT "briefing_cost_check" CHECK ("briefing"."cost_micro_usd" >= 0),
	CONSTRAINT "briefing_unknown_refs_check" CHECK ("briefing"."unknown_refs" >= 0),
	CONSTRAINT "briefing_error_check" CHECK ("briefing"."status" = 'succeeded' or "briefing"."error" is not null)
);
--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefing_user_id_started_at_idx" ON "briefing" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "briefing_started_at_idx" ON "briefing" USING btree ("started_at");