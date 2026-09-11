CREATE TYPE "public"."finding_origin" AS ENUM('deterministic', 'ai_assisted');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('info', 'warning', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"origin" "finding_origin" NOT NULL,
	"generation_id" uuid,
	"severity" "finding_severity" NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" text,
	"dismissed_reason" text,
	CONSTRAINT "findings_project_fingerprint_key" UNIQUE("project_id","fingerprint"),
	CONSTRAINT "findings_generation_id_consistency" CHECK (("findings"."origin" = 'ai_assisted') = ("findings"."generation_id" is not null)),
	CONSTRAINT "findings_dismissed_consistency" CHECK (("findings"."status" = 'dismissed') = ("findings"."dismissed_at" is not null and "findings"."dismissed_by" is not null)),
	CONSTRAINT "findings_resolved_consistency" CHECK (("findings"."status" = 'resolved') = ("findings"."resolved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_project_idx" ON "findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "findings_project_status_idx" ON "findings" USING btree ("project_id","status");