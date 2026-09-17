CREATE TYPE "public"."asset_pipeline_stage" AS ENUM('concept', 'in_progress', 'production_ready');--> statement-breakpoint
ALTER TYPE "public"."activity_subject_type" ADD VALUE 'asset';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'asset_stage_changed';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "pipeline_stage" "asset_pipeline_stage" DEFAULT 'concept' NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_project_pipeline_stage_idx" ON "assets" USING btree ("project_id","pipeline_stage");