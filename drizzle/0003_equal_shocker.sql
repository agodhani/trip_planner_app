CREATE TYPE "public"."pair_avail" AS ENUM('works', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "date_pair_prefs" (
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"depart" text NOT NULL,
	"back" text DEFAULT '' NOT NULL,
	"value" "pair_avail" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_pair_prefs_trip_id_user_id_depart_back_pk" PRIMARY KEY("trip_id","user_id","depart","back")
);
--> statement-breakpoint
ALTER TABLE "date_pair_prefs" ADD CONSTRAINT "date_pair_prefs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_pair_prefs" ADD CONSTRAINT "date_pair_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "date_pair_prefs_trip_idx" ON "date_pair_prefs" USING btree ("trip_id");