CREATE TABLE "github_assignment" (
	"connection_id" uuid NOT NULL,
	"subject_node_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"login" text NOT NULL,
	"role" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_assignment_connection_id_subject_node_id_login_role_pk" PRIMARY KEY("connection_id","subject_node_id","login","role")
);
--> statement-breakpoint
CREATE TABLE "github_check_rollup" (
	"connection_id" uuid NOT NULL,
	"pull_request_node_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"state" text NOT NULL,
	"success_count" integer NOT NULL,
	"failure_count" integer NOT NULL,
	"pending_count" integer NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_check_rollup_connection_id_pull_request_node_id_pk" PRIMARY KEY("connection_id","pull_request_node_id")
);
--> statement-breakpoint
CREATE TABLE "github_issue" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"repository_node_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author" text,
	"updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_issue_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "github_pull_request" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"repository_node_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"draft" boolean NOT NULL,
	"mergeable" text NOT NULL,
	"review_decision" text,
	"author" text,
	"head_ref" text NOT NULL,
	"head_sha" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_pull_request_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "github_repo" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"full_name" text NOT NULL,
	"url" text NOT NULL,
	"default_branch" text,
	"archived" boolean NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_repo_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "github_review_request" (
	"connection_id" uuid NOT NULL,
	"pull_request_node_id" text NOT NULL,
	"reviewer_kind" text NOT NULL,
	"reviewer" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_review_request_pk" PRIMARY KEY("connection_id","pull_request_node_id","reviewer_kind","reviewer")
);
--> statement-breakpoint
CREATE TABLE "github_sync" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"viewer_login" text,
	"last_synced_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "github_workflow_run" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"repository_node_id" text NOT NULL,
	"pull_request_node_id" text,
	"workflow_name" text NOT NULL,
	"run_number" integer NOT NULL,
	"branch" text NOT NULL,
	"head_sha" text NOT NULL,
	"event" text NOT NULL,
	"conclusion" text NOT NULL,
	"url" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_workflow_run_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "github_assignment" ADD CONSTRAINT "github_assignment_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_rollup" ADD CONSTRAINT "github_check_rollup_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issue" ADD CONSTRAINT "github_issue_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_request" ADD CONSTRAINT "github_pull_request_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repo" ADD CONSTRAINT "github_repo_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_review_request" ADD CONSTRAINT "github_review_request_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_sync" ADD CONSTRAINT "github_sync_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_workflow_run" ADD CONSTRAINT "github_workflow_run_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;