CREATE TABLE "agent_session" (
	"session_id" text NOT NULL,
	"agent_id" text DEFAULT '' NOT NULL,
	"agent_name" text NOT NULL,
	"bench_id" text,
	"harness" text NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"question" jsonb,
	"highest_seq" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_session_session_id_agent_id_pk" PRIMARY KEY("session_id","agent_id")
);
--> statement-breakpoint
DELETE FROM "agent_heartbeat";--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "session_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "seq" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "harness" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "question" jsonb;--> statement-breakpoint
ALTER TABLE "agent_heartbeat" ADD COLUMN "emitted_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_session_updated_at_idx" ON "agent_session" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "agent_heartbeat_received_at_idx" ON "agent_heartbeat" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_heartbeat_session_id_seq_idx" ON "agent_heartbeat" USING btree ("session_id","seq");--> statement-breakpoint
ALTER TABLE "agent_heartbeat" DROP COLUMN "sent_at";