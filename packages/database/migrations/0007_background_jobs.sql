CREATE TYPE "public"."job_kind" AS ENUM('generation');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'preparing_context', 'running', 'processing', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "job_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress_completed" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 1 NOT NULL,
	"progress_step" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"failure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_terminal_completed_at" CHECK (("jobs"."status" in ('complete', 'failed', 'cancelled')) = ("jobs"."completed_at" is not null)),
	CONSTRAINT "jobs_progress_bounds" CHECK ("jobs"."progress_total" >= 1 and "jobs"."progress_completed" between 0 and "jobs"."progress_total"),
	CONSTRAINT "jobs_attempt_bounds" CHECK ("jobs"."max_attempts" >= 1 and "jobs"."attempt" between 1 and "jobs"."max_attempts")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_project_idx" ON "jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "jobs_project_status_idx" ON "jobs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "jobs_project_created_at_idx" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_project_target_idx" ON "jobs" USING btree ("project_id","kind","target_id");