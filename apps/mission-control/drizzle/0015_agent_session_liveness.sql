DROP TABLE "example_heartbeats" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "liveness" text DEFAULT 'live' NOT NULL;