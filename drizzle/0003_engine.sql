CREATE TABLE "memory_files" (
	"path" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"date" date PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"confidence" real NOT NULL,
	"spot" text NOT NULL,
	"payload" jsonb NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "spots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"notes" text,
	"lat" real,
	"lon" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spots_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "walks" (
	"date" date PRIMARY KEY NOT NULL,
	"spot_id" integer,
	"stayed_in" boolean DEFAULT false NOT NULL,
	"rating" integer,
	"note" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE set null ON UPDATE no action;