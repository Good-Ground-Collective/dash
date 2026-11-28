CREATE TABLE "github_release" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"repository_node_id" text NOT NULL,
	"tag_name" text NOT NULL,
	"name" text,
	"url" text NOT NULL,
	"author" text,
	"prerelease" boolean NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_release_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "github_pull_request" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_release" ADD CONSTRAINT "github_release_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;