CREATE TABLE "needs_you_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by" uuid NOT NULL,
	"session_id" text NOT NULL,
	"agent_id" text DEFAULT '' NOT NULL,
	"question" jsonb,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "needs_you_item_open_idx" ON "needs_you_item" USING btree ("reported_by","session_id","agent_id") WHERE "needs_you_item"."resolved_at" is null;