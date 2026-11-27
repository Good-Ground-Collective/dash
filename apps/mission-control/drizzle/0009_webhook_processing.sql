CREATE TABLE "github_sync_request" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD COLUMN "installation_change" text;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD COLUMN "dispatch_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_sync_request" ADD CONSTRAINT "github_sync_request_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_received_at_idx" ON "webhook_delivery" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_pending_idx" ON "webhook_delivery" USING btree ("received_at") WHERE "webhook_delivery"."dispatch_pending";