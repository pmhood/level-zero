ALTER TYPE "public"."entity_type" ADD VALUE 'region' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'lore' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'event' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'hazard' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'culture' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'technology' BEFORE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."entity_relation" ADD VALUE 'controls' BEFORE 'replaces';