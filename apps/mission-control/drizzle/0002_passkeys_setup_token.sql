CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "setup_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_token_slot_unique" UNIQUE("slot"),
	CONSTRAINT "setup_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "setup_token_slot_check" CHECK ("setup_token"."slot" = 'first-person')
);
--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE FUNCTION "passkey_keep_last"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	PERFORM 1 FROM "user" WHERE "id" = OLD."user_id" FOR UPDATE;
	IF FOUND AND NOT EXISTS (
		SELECT 1 FROM "passkey" WHERE "user_id" = OLD."user_id" AND "id" <> OLD."id"
	) THEN
		RAISE EXCEPTION 'A person must keep at least one passkey' USING ERRCODE = 'check_violation';
	END IF;
	RETURN OLD;
END;
$$;--> statement-breakpoint
COMMENT ON FUNCTION "passkey_keep_last"() IS 'Refuses to delete a person''s last passkey. Locking the person row serialises concurrent deletes, so two of them cannot each see the other''s passkey and remove both. Deleting the person cascades freely: their row is already gone, so FOUND is false.';--> statement-breakpoint
CREATE TRIGGER "passkey_keep_last" BEFORE DELETE ON "passkey" FOR EACH ROW EXECUTE FUNCTION "passkey_keep_last"();
