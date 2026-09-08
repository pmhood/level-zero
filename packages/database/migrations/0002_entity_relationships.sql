-- NOTE: the unique constraint on entities(id, project_id) is applied first.
-- The composite foreign keys below reference it, and drizzle-kit emits it last,
-- which Postgres rejects. Keep this ordering if this file is ever regenerated.
ALTER TABLE "entities" ADD CONSTRAINT "entities_id_project_id_key" UNIQUE("id","project_id");
--> statement-breakpoint
CREATE TYPE "public"."entity_relation" AS ENUM('contains', 'references', 'inspired_by', 'generated_from', 'derived_from', 'promoted_to', 'depends_on', 'implements', 'appears_in', 'belongs_to', 'replaces');
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"relation" "entity_relation" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_relationships_edge_key" UNIQUE("source_entity_id","target_entity_id","relation"),
	CONSTRAINT "entity_relationships_no_self_link" CHECK ("entity_relationships"."source_entity_id" <> "entity_relationships"."target_entity_id")
);
--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_source_fk" FOREIGN KEY ("source_entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_target_fk" FOREIGN KEY ("target_entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "entity_relationships_project_idx" ON "entity_relationships" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "entity_relationships_source_idx" ON "entity_relationships" USING btree ("source_entity_id");
--> statement-breakpoint
CREATE INDEX "entity_relationships_target_idx" ON "entity_relationships" USING btree ("target_entity_id");
--> statement-breakpoint
CREATE INDEX "entity_relationships_project_relation_idx" ON "entity_relationships" USING btree ("project_id","relation");
