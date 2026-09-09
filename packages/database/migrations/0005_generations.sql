CREATE TYPE "public"."generation_status" AS ENUM('queued', 'running', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"provider" text,
	"model" text,
	"prompt" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"input_entity_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"input_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"context_entity_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"output_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"parent_generation_id" uuid,
	"seed" text,
	"provider_request_id" text,
	"failure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text,
	CONSTRAINT "generations_terminal_completed_at" CHECK (("generations"."status" in ('complete', 'failed', 'cancelled')) = ("generations"."completed_at" is not null)),
	CONSTRAINT "generations_failure_consistency" CHECK (("generations"."status" = 'failed') = ("generations"."failure" is not null))
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_parent_generation_id_generations_id_fk" FOREIGN KEY ("parent_generation_id") REFERENCES "public"."generations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_project_idx" ON "generations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generations_project_status_idx" ON "generations" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "generations_project_created_at_idx" ON "generations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "generations_parent_idx" ON "generations" USING btree ("parent_generation_id");--> statement-breakpoint
CREATE INDEX "generations_output_assets_idx" ON "generations" USING gin ("output_asset_ids");--> statement-breakpoint
CREATE INDEX "generations_input_entities_idx" ON "generations" USING gin ("input_entity_ids");--> statement-breakpoint
CREATE INDEX "generations_context_entities_idx" ON "generations" USING gin ("context_entity_ids");