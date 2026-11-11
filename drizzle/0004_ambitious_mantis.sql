ALTER TABLE "trips" ADD COLUMN "budget_total" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "budget_by_category" jsonb;