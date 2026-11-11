ALTER TABLE "trip_options" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_options" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "trip_options" ADD CONSTRAINT "trip_options_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;