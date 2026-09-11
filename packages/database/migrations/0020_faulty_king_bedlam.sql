CREATE TYPE "public"."asset_mark_kind" AS ENUM('favorite', 'shortlisted');--> statement-breakpoint
CREATE TYPE "public"."asset_selection_state" AS ENUM('approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "asset_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" "asset_mark_kind" NOT NULL,
	"actor" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_marks_project_asset_kind_key" UNIQUE("project_id","asset_id","kind")
);
--> statement-breakpoint
CREATE TABLE "asset_selections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"context_entity_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"state" "asset_selection_state" NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"superseded_by_selection_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_selections_supersession_names_its_replacement" CHECK (("asset_selections"."state" = 'superseded') = ("asset_selections"."superseded_by_selection_id" is not null)),
	CONSTRAINT "asset_selections_purpose_not_blank" CHECK (length(trim("asset_selections"."purpose")) > 0)
);
--> statement-breakpoint
ALTER TABLE "asset_marks" ADD CONSTRAINT "asset_marks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_marks" ADD CONSTRAINT "asset_marks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_selections" ADD CONSTRAINT "asset_selections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_selections" ADD CONSTRAINT "asset_selections_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_selections" ADD CONSTRAINT "asset_selections_superseded_by_selection_id_asset_selections_id_fk" FOREIGN KEY ("superseded_by_selection_id") REFERENCES "public"."asset_selections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_selections" ADD CONSTRAINT "asset_selections_context_entity_fk" FOREIGN KEY ("context_entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_marks_project_kind_idx" ON "asset_marks" USING btree ("project_id","kind","marked_at");--> statement-breakpoint
CREATE INDEX "asset_selections_project_context_idx" ON "asset_selections" USING btree ("project_id","context_entity_id","purpose","decided_at");--> statement-breakpoint
CREATE INDEX "asset_selections_project_asset_idx" ON "asset_selections" USING btree ("project_id","asset_id","decided_at");