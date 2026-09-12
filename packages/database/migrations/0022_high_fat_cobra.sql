DROP INDEX "assets_project_created_at_idx";--> statement-breakpoint
CREATE INDEX "assets_project_created_at_idx" ON "assets" USING btree ("project_id","created_at","id");