ALTER TABLE "briefing" DROP CONSTRAINT "briefing_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "briefing" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;