CREATE TABLE "schedule_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedule_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"weekdays" jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"back_by" text,
	"stay_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "minutes_home" integer;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "loop_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_updates" ADD COLUMN "media_group_id" text;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "slept_in" boolean DEFAULT false NOT NULL;