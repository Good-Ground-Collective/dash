ALTER TABLE "github_pull_request" ADD COLUMN "merge_state_status" text;--> statement-breakpoint
ALTER TABLE "github_pull_request" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "github_pull_request" SET "created_at" = "updated_at";--> statement-breakpoint
ALTER TABLE "github_pull_request" ALTER COLUMN "created_at" SET NOT NULL;
