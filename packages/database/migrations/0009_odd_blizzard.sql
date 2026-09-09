CREATE TYPE "public"."activity_subject_type" AS ENUM('entity', 'entity_version', 'generation', 'prototype_version');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('entity_created', 'entity_archived', 'entity_restored', 'entity_promoted', 'entity_version_created', 'entity_version_restored', 'generation_completed', 'generation_failed', 'prototype_version_created');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"summary" text NOT NULL,
	"subject_type" "activity_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_project_created_idx" ON "activities" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "activities_project_subject_idx" ON "activities" USING btree ("project_id","subject_id");