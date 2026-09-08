CREATE TYPE "public"."entity_version_reason" AS ENUM('manual', 'milestone', 'restore', 'branch', 'promotion', 'ai_edit', 'playtest', 'import');--> statement-breakpoint
CREATE TABLE "entity_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" uuid,
	"branch_name" text DEFAULT 'main' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" "entity_version_reason" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_versions_entity_number_key" UNIQUE("entity_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_entity_fk" FOREIGN KEY ("entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_parent_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_versions_project_idx" ON "entity_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entity_versions_entity_idx" ON "entity_versions" USING btree ("entity_id","version_number");--> statement-breakpoint
CREATE INDEX "entity_versions_branch_idx" ON "entity_versions" USING btree ("entity_id","branch_name");--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_current_version_id_entity_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE set null ON UPDATE no action;