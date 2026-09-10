CREATE TYPE "public"."moodboard_node_type" AS ENUM('asset', 'entity', 'text', 'note', 'palette', 'link', 'group');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'moodboard' BEFORE 'document';--> statement-breakpoint
CREATE TABLE "moodboard_connectors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"label" text,
	"relationship_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moodboard_connectors_no_self_link" CHECK ("moodboard_connectors"."from_node_id" <> "moodboard_connectors"."to_node_id")
);
--> statement-breakpoint
CREATE TABLE "moodboard_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"type" "moodboard_node_type" NOT NULL,
	"asset_id" uuid,
	"entity_id" uuid,
	"group_id" uuid,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"z_order" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moodboard_nodes_id_project_id_key" UNIQUE("id","project_id"),
	CONSTRAINT "moodboard_nodes_reference_consistency" CHECK (("moodboard_nodes"."type" = 'asset') = ("moodboard_nodes"."asset_id" IS NOT NULL) AND ("moodboard_nodes"."type" = 'entity') = ("moodboard_nodes"."entity_id" IS NOT NULL)),
	CONSTRAINT "moodboard_nodes_positive_size" CHECK ("moodboard_nodes"."width" > 0 AND "moodboard_nodes"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "moodboard_connectors" ADD CONSTRAINT "moodboard_connectors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_connectors" ADD CONSTRAINT "moodboard_connectors_relationship_id_entity_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."entity_relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_connectors" ADD CONSTRAINT "moodboard_connectors_board_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_connectors" ADD CONSTRAINT "moodboard_connectors_from_fk" FOREIGN KEY ("from_node_id","project_id") REFERENCES "public"."moodboard_nodes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_connectors" ADD CONSTRAINT "moodboard_connectors_to_fk" FOREIGN KEY ("to_node_id","project_id") REFERENCES "public"."moodboard_nodes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_nodes" ADD CONSTRAINT "moodboard_nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_nodes" ADD CONSTRAINT "moodboard_nodes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_nodes" ADD CONSTRAINT "moodboard_nodes_group_id_moodboard_nodes_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."moodboard_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_nodes" ADD CONSTRAINT "moodboard_nodes_board_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moodboard_nodes" ADD CONSTRAINT "moodboard_nodes_entity_fk" FOREIGN KEY ("entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moodboard_connectors_project_idx" ON "moodboard_connectors" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "moodboard_connectors_board_idx" ON "moodboard_connectors" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "moodboard_connectors_from_idx" ON "moodboard_connectors" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "moodboard_connectors_to_idx" ON "moodboard_connectors" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "moodboard_nodes_project_idx" ON "moodboard_nodes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "moodboard_nodes_board_idx" ON "moodboard_nodes" USING btree ("board_id","z_order");--> statement-breakpoint
CREATE INDEX "moodboard_nodes_asset_idx" ON "moodboard_nodes" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "moodboard_nodes_entity_idx" ON "moodboard_nodes" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "moodboard_nodes_group_idx" ON "moodboard_nodes" USING btree ("group_id");