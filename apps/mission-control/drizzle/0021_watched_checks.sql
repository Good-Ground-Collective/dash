CREATE TABLE "github_watch_override" (
	"user_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"check_name" text NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "github_watch_override_user_id_repository_check_name_pk" PRIMARY KEY("user_id","repository","check_name"),
	CONSTRAINT "github_watch_override_mode_check" CHECK ("github_watch_override"."mode" in ('watch', 'ignore'))
);
--> statement-breakpoint
CREATE TABLE "github_watch_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_watch_rule_user_pattern_unique" UNIQUE("user_id","pattern")
);
--> statement-breakpoint
ALTER TABLE "github_watch_override" ADD CONSTRAINT "github_watch_override_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_watch_rule" ADD CONSTRAINT "github_watch_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;