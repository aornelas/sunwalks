CREATE TABLE "forecast_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "forecast_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"lead_days" integer NOT NULL,
	"source" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"cloud_total" real NOT NULL,
	"cloud_low" real NOT NULL,
	"cloud_mid" real NOT NULL,
	"cloud_high" real NOT NULL,
	"temp_at_sunrise" real NOT NULL,
	"wind_speed" real NOT NULL,
	"precip_probability" real NOT NULL,
	"fog_probability" real NOT NULL,
	"ceiling_ft" real,
	"verdict" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_tags" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"observed_category" text NOT NULL,
	"category_confidence" text NOT NULL,
	"vantage" text NOT NULL,
	"colours" jsonb NOT NULL,
	"cloud_type" text NOT NULL,
	"cloud_cover" integer NOT NULL,
	"drama" integer NOT NULL,
	"drama_reason" text NOT NULL,
	"mood" text NOT NULL,
	"alt_text" text NOT NULL,
	"suggested_place" text,
	"landmarks" jsonb NOT NULL,
	"batch_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"tagged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tagging_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"photo_ids" jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "claude_file_id" text;--> statement-breakpoint
ALTER TABLE "photo_tags" ADD CONSTRAINT "photo_tags_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshots_date_lead_source_idx" ON "forecast_snapshots" USING btree ("date","lead_days","source");--> statement-breakpoint
CREATE INDEX "photo_tags_category_idx" ON "photo_tags" USING btree ("observed_category");