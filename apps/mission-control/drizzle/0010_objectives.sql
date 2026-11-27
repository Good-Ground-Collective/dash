CREATE TABLE "objective_overlay" (
	"user_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"parked" boolean DEFAULT false NOT NULL,
	"manual_progress" integer,
	"priority" text,
	"due_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_overlay_user_id_node_id_pk" PRIMARY KEY("user_id","node_id"),
	CONSTRAINT "objective_overlay_manual_progress_check" CHECK ("objective_overlay"."manual_progress" between 0 and 100),
	CONSTRAINT "objective_overlay_priority_check" CHECK ("objective_overlay"."priority" in ('P1', 'P2', 'P3'))
);
--> statement-breakpoint
CREATE TABLE "objective_activity" (
	"connection_id" uuid NOT NULL,
	"ticket_node_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor" text,
	"url" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "objective_activity_connection_id_ticket_node_id_kind_pk" PRIMARY KEY("connection_id","ticket_node_id","kind")
);
--> statement-breakpoint
CREATE TABLE "objective_epic" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"priority" text,
	"last_activity_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"due_date" date,
	CONSTRAINT "objective_epic_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "objective_initiative" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"priority" text,
	"last_activity_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"due_date" date,
	CONSTRAINT "objective_initiative_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "objective_placement" (
	"connection_id" uuid NOT NULL,
	"initiative_node_id" text NOT NULL,
	"epic_node_id" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "objective_placement_connection_id_initiative_node_id_epic_node_id_pk" PRIMARY KEY("connection_id","initiative_node_id","epic_node_id")
);
--> statement-breakpoint
CREATE TABLE "objective_sync" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"truncated" boolean
);
--> statement-breakpoint
CREATE TABLE "objective_ticket" (
	"connection_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"priority" text,
	"last_activity_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"epic_node_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "objective_ticket_connection_id_node_id_pk" PRIMARY KEY("connection_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "objective_overlay" ADD CONSTRAINT "objective_overlay_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_activity" ADD CONSTRAINT "objective_activity_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_epic" ADD CONSTRAINT "objective_epic_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_initiative" ADD CONSTRAINT "objective_initiative_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_placement" ADD CONSTRAINT "objective_placement_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_sync" ADD CONSTRAINT "objective_sync_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_ticket" ADD CONSTRAINT "objective_ticket_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;