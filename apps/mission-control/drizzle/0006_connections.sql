CREATE TABLE "connection_repository" (
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"full_name" text NOT NULL,
	"url" text NOT NULL,
	"default_branch" text NOT NULL,
	"archived" boolean NOT NULL,
	CONSTRAINT "connection_repository_connection_id_external_id_pk" PRIMARY KEY("connection_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"installation_id" text,
	"account_external_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_kind" text NOT NULL,
	"account_url" text NOT NULL,
	"settings_url" text,
	"repository_selection" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_kind_check" CHECK ("connection"."kind" in ('owned', 'guest')),
	CONSTRAINT "connection_owned_installation_check" CHECK ("connection"."kind" <> 'owned' or ("connection"."installation_id" is not null and "connection"."settings_url" is not null and "connection"."repository_selection" is not null))
);
--> statement-breakpoint
CREATE TABLE "install_request" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_external_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "install_request_user_id_provider_account_external_id_pk" PRIMARY KEY("user_id","provider","account_external_id")
);
--> statement-breakpoint
CREATE TABLE "linked_account" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"login" text NOT NULL,
	"url" text NOT NULL,
	"sealed_access_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"sealed_refresh_token" text,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linked_account_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"installation_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_delivery_provider_delivery_id_pk" PRIMARY KEY("provider","delivery_id")
);
--> statement-breakpoint
ALTER TABLE "connection_repository" ADD CONSTRAINT "connection_repository_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_connected_by_user_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_request" ADD CONSTRAINT "install_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_account" ADD CONSTRAINT "linked_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_provider_installation_id_idx" ON "connection" USING btree ("provider","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_account_provider_external_id_idx" ON "linked_account" USING btree ("provider","external_id");