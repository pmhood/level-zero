CREATE TABLE "app_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_metadata" ("key", "value") VALUES ('bootstrap', '{"schemaVersion":1}'::jsonb) ON CONFLICT ("key") DO NOTHING;
