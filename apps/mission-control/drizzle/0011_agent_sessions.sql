CREATE TABLE "agent_session" (
	"reported_by" uuid NOT NULL,
	"session_id" text NOT NULL,
	"agent_id" text DEFAULT '' NOT NULL,
	"reporter_name" text NOT NULL,
	"bench_id" text,
	"harness" text NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"question" jsonb,
	"error" jsonb,
	"task_id" text,
	"workspace" jsonb,
	"machine" text,
	"agent" jsonb,
	"highest_seq" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_session_reported_by_session_id_agent_id_pk" PRIMARY KEY("reported_by","session_id","agent_id")
);
--> statement-breakpoint
DELETE FROM "agent_heartbeat";--> statement-breakpoint
DROP INDEX "agent_heartbeat_agent_name_received_at_idx";--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "reporter_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "session_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "seq" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "harness" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "question" jsonb;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "error" jsonb;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "workspace" jsonb;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "machine" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "agent" jsonb;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "emitted_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_session_updated_at_idx" ON "agent_session" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "agent_heartbeat_reporter_name_received_at_idx" ON "agent_heartbeat" USING btree ("reporter_name","received_at");--> statement-breakpoint
CREATE INDEX "agent_heartbeat_received_at_idx" ON "agent_heartbeat" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_heartbeat_reported_by_session_id_seq_idx" ON "agent_heartbeat" USING btree ("reported_by","session_id","seq");--> statement-breakpoint
ALTER TABLE "agent_heartbeat" DROP COLUMN "agent_name";--> statement-breakpoint
ALTER TABLE "agent_heartbeat" DROP COLUMN "sent_at";