CREATE TABLE "github_check" (
	"connection_id" uuid NOT NULL,
	"subject_node_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"name" text NOT NULL,
	"head_sha" text NOT NULL,
	"kind" text NOT NULL,
	"app" text,
	"state" text NOT NULL,
	"url" text,
	"failing_since" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_check_connection_id_subject_node_id_name_pk" PRIMARY KEY("connection_id","subject_node_id","name")
);
--> statement-breakpoint
ALTER TABLE "github_repo" ADD COLUMN "default_branch_head_sha" text;--> statement-breakpoint
ALTER TABLE "github_repo" ADD COLUMN "default_branch_state" text;--> statement-breakpoint
ALTER TABLE "github_check" ADD CONSTRAINT "github_check_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;