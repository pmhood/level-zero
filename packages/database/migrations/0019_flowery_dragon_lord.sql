CREATE TYPE "public"."review_state" AS ENUM('draft', 'review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_target_type" AS ENUM('entity', 'asset', 'prototype_version');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" "review_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_anchor" text,
	"version_id" uuid,
	"parent_comment_id" uuid,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_id_project_id_key" UNIQUE("id","project_id"),
	CONSTRAINT "comments_resolution_consistency" CHECK (("comments"."resolved_at" is null) = ("comments"."resolved_by" is null)),
	CONSTRAINT "comments_replies_are_not_resolvable" CHECK ("comments"."parent_comment_id" is null or "comments"."resolved_at" is null),
	CONSTRAINT "comments_version_is_entity_only" CHECK ("comments"."version_id" is null or "comments"."target_type" = 'entity')
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" "review_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_anchor" text,
	"version_id" uuid,
	"state" "review_state" NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_decisions_version_is_entity_only" CHECK ("review_decisions"."version_id" is null or "review_decisions"."target_type" = 'entity')
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_fk" FOREIGN KEY ("parent_comment_id","project_id") REFERENCES "public"."comments"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_version_fk" FOREIGN KEY ("version_id","target_id","project_id") REFERENCES "public"."entity_versions"("id","entity_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_version_fk" FOREIGN KEY ("version_id","target_id","project_id") REFERENCES "public"."entity_versions"("id","entity_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_project_target_idx" ON "comments" USING btree ("project_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "review_decisions_project_target_idx" ON "review_decisions" USING btree ("project_id","target_type","target_id","decided_at");