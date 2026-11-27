ALTER TABLE "user" ADD COLUMN "theme" text DEFAULT 'characters' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "color_mode" text;--> statement-breakpoint
ALTER TABLE "service_profile" ADD COLUMN "hue" text DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_color_mode_check" CHECK ("user"."color_mode" is null or "user"."color_mode" in ('light', 'dark'));