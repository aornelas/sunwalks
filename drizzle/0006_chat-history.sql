CREATE TABLE "chat_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_at_idx" ON "chat_messages" USING btree ("at");