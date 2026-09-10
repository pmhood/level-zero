CREATE TYPE "public"."playtest_sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."playtest_status" AS ENUM('planned', 'running', 'complete', 'cancelled');--> statement-breakpoint
CREATE TABLE "playtest_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"playtest_id" uuid NOT NULL,
	"session_id" uuid,
	"body" text NOT NULL,
	"sentiment" "playtest_sentiment",
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playtest_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"playtest_id" uuid NOT NULL,
	"session_id" uuid,
	"metric_key" text NOT NULL,
	"label" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playtest_metrics_playtest_session_metric_key" UNIQUE NULLS NOT DISTINCT("playtest_id","session_id","metric_key")
);
--> statement-breakpoint
CREATE TABLE "playtest_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"playtest_id" uuid NOT NULL,
	"session_id" uuid,
	"entity_id" uuid,
	"at_seconds" integer,
	"body" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"observed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playtest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"playtest_id" uuid NOT NULL,
	"session_number" integer NOT NULL,
	"participant" text,
	"notes" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playtest_sessions_playtest_number_key" UNIQUE("playtest_id","session_number"),
	CONSTRAINT "playtest_sessions_id_project_id_key" UNIQUE("id","project_id"),
	CONSTRAINT "playtest_sessions_id_playtest_id_key" UNIQUE("id","playtest_id")
);
--> statement-breakpoint
CREATE TABLE "playtests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"prototype_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"status" "playtest_status" DEFAULT 'planned' NOT NULL,
	"summary" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playtests_id_project_id_key" UNIQUE("id","project_id")
);
--> statement-breakpoint
ALTER TABLE "playtest_feedback" ADD CONSTRAINT "playtest_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_feedback" ADD CONSTRAINT "playtest_feedback_playtest_fk" FOREIGN KEY ("playtest_id","project_id") REFERENCES "public"."playtests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_feedback" ADD CONSTRAINT "playtest_feedback_session_fk" FOREIGN KEY ("session_id","playtest_id") REFERENCES "public"."playtest_sessions"("id","playtest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_metrics" ADD CONSTRAINT "playtest_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_metrics" ADD CONSTRAINT "playtest_metrics_playtest_fk" FOREIGN KEY ("playtest_id","project_id") REFERENCES "public"."playtests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_metrics" ADD CONSTRAINT "playtest_metrics_session_fk" FOREIGN KEY ("session_id","playtest_id") REFERENCES "public"."playtest_sessions"("id","playtest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_observations" ADD CONSTRAINT "playtest_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_observations" ADD CONSTRAINT "playtest_observations_playtest_fk" FOREIGN KEY ("playtest_id","project_id") REFERENCES "public"."playtests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_observations" ADD CONSTRAINT "playtest_observations_session_fk" FOREIGN KEY ("session_id","playtest_id") REFERENCES "public"."playtest_sessions"("id","playtest_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_observations" ADD CONSTRAINT "playtest_observations_entity_fk" FOREIGN KEY ("entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_sessions" ADD CONSTRAINT "playtest_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtest_sessions" ADD CONSTRAINT "playtest_sessions_playtest_fk" FOREIGN KEY ("playtest_id","project_id") REFERENCES "public"."playtests"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtests" ADD CONSTRAINT "playtests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtests" ADD CONSTRAINT "playtests_prototype_version_fk" FOREIGN KEY ("prototype_version_id","project_id") REFERENCES "public"."prototype_versions"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playtest_feedback_project_idx" ON "playtest_feedback" USING btree ("project_id","playtest_id");--> statement-breakpoint
CREATE INDEX "playtest_feedback_session_idx" ON "playtest_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "playtest_feedback_tags_idx" ON "playtest_feedback" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "playtest_metrics_project_idx" ON "playtest_metrics" USING btree ("project_id","playtest_id");--> statement-breakpoint
CREATE INDEX "playtest_metrics_playtest_key_idx" ON "playtest_metrics" USING btree ("playtest_id","metric_key");--> statement-breakpoint
CREATE INDEX "playtest_observations_project_idx" ON "playtest_observations" USING btree ("project_id","playtest_id");--> statement-breakpoint
CREATE INDEX "playtest_observations_session_idx" ON "playtest_observations" USING btree ("session_id","at_seconds");--> statement-breakpoint
CREATE INDEX "playtest_observations_entity_idx" ON "playtest_observations" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "playtest_observations_tags_idx" ON "playtest_observations" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "playtest_sessions_project_idx" ON "playtest_sessions" USING btree ("project_id","playtest_id");--> statement-breakpoint
CREATE INDEX "playtests_project_idx" ON "playtests" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "playtests_prototype_version_idx" ON "playtests" USING btree ("prototype_version_id");--> statement-breakpoint
CREATE INDEX "playtests_tags_idx" ON "playtests" USING gin ("tags");