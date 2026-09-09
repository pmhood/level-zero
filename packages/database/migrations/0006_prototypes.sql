-- Moved ahead of the foreign key that needs it: a composite reference to
-- entity_versions(id, entity_id, project_id) requires the matching unique
-- constraint to exist first.
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_identity_key" UNIQUE("id","entity_id","project_id");--> statement-breakpoint
CREATE TYPE "public"."prototype_version_status" AS ENUM('draft', 'playable', 'archived');--> statement-breakpoint
CREATE TABLE "prototype_entity_versions" (
	"prototype_version_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "prototype_entity_versions_prototype_version_id_entity_id_pk" PRIMARY KEY("prototype_version_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "prototype_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"prototype_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"name" text,
	"status" "prototype_version_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"build_asset_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prototype_versions_prototype_number_key" UNIQUE("prototype_id","version_number"),
	CONSTRAINT "prototype_versions_id_project_id_key" UNIQUE("id","project_id")
);
--> statement-breakpoint
ALTER TABLE "prototype_entity_versions" ADD CONSTRAINT "prototype_entity_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_entity_versions" ADD CONSTRAINT "prototype_entity_versions_prototype_version_fk" FOREIGN KEY ("prototype_version_id","project_id") REFERENCES "public"."prototype_versions"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_entity_versions" ADD CONSTRAINT "prototype_entity_versions_entity_version_fk" FOREIGN KEY ("entity_version_id","entity_id","project_id") REFERENCES "public"."entity_versions"("id","entity_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_versions" ADD CONSTRAINT "prototype_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_versions" ADD CONSTRAINT "prototype_versions_build_asset_id_assets_id_fk" FOREIGN KEY ("build_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_versions" ADD CONSTRAINT "prototype_versions_prototype_fk" FOREIGN KEY ("prototype_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prototype_entity_versions_project_idx" ON "prototype_entity_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "prototype_entity_versions_entity_version_idx" ON "prototype_entity_versions" USING btree ("entity_version_id");--> statement-breakpoint
CREATE INDEX "prototype_versions_project_idx" ON "prototype_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "prototype_versions_prototype_idx" ON "prototype_versions" USING btree ("prototype_id","version_number");--> statement-breakpoint
CREATE INDEX "prototype_versions_build_asset_idx" ON "prototype_versions" USING btree ("build_asset_id");
