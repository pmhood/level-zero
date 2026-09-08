CREATE TYPE "public"."entity_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('idea', 'design_pillar', 'character', 'location', 'faction', 'mechanic', 'system', 'asset_reference', 'scene', 'document', 'prototype', 'build');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "entity_status" DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_project_idx" ON "entities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entities_project_type_idx" ON "entities" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "entities_project_status_idx" ON "entities" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "entities_project_created_at_idx" ON "entities" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "entities_tags_idx" ON "entities" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");