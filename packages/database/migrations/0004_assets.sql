CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'model_3d', 'reference', 'export', 'build_artifact');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."asset_variant" AS ENUM('source', 'thumbnail', 'preview');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"variant" "asset_variant" DEFAULT 'source' NOT NULL,
	"source_asset_id" uuid,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	CONSTRAINT "assets_variant_source_consistency" CHECK (("assets"."variant" = 'source' AND "assets"."source_asset_id" IS NULL) OR ("assets"."variant" <> 'source' AND "assets"."source_asset_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_project_kind_idx" ON "assets" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "assets_project_status_idx" ON "assets" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "assets_project_created_at_idx" ON "assets" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_source_idx" ON "assets" USING btree ("source_asset_id");