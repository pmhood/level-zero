CREATE TYPE "public"."search_source_type" AS ENUM('entity', 'asset', 'generation');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'search_index';--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_type" "search_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"entity_type" "entity_type",
	"status" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')) STORED,
	"content_hash" text NOT NULL,
	"embedding" double precision[],
	"embedding_model" text,
	"embedded_hash" text,
	"source_version_id" uuid,
	"source_updated_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_documents_source_key" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_project_idx" ON "search_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "search_documents_project_source_type_idx" ON "search_documents" USING btree ("project_id","source_type");--> statement-breakpoint
CREATE INDEX "search_documents_project_updated_at_idx" ON "search_documents" USING btree ("project_id","source_updated_at");--> statement-breakpoint
CREATE INDEX "search_documents_vector_idx" ON "search_documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "search_documents_tags_idx" ON "search_documents" USING gin ("tags");