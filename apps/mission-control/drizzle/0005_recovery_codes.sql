CREATE TABLE "recovery_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"state" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_code_state_check" CHECK ("recovery_code"."state" in ('pending', 'active', 'used')),
	CONSTRAINT "recovery_code_used_at_check" CHECK (("recovery_code"."state" = 'used') = ("recovery_code"."used_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_code_user_id_code_hash_idx" ON "recovery_code" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE INDEX "recovery_code_set_id_idx" ON "recovery_code" USING btree ("set_id");