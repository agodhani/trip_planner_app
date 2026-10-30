CREATE TYPE "public"."cabin_class" AS ENUM('economy', 'premium_economy', 'business', 'first');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('flights', 'lodging', 'food', 'activities', 'transport', 'shopping', 'fees', 'other');--> statement-breakpoint
CREATE TYPE "public"."flight_search_status" AS ENUM('queued', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('flight_depart', 'flight_arrive', 'checkin', 'checkout', 'activity', 'transport', 'meal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."item_outcome" AS ENUM('planned', 'done', 'skipped', 'changed');--> statement-breakpoint
CREATE TYPE "public"."leg_mode" AS ENUM('walk', 'transit', 'drive', 'bike', 'other');--> statement-breakpoint
CREATE TYPE "public"."leg_source" AS ENUM('osrm', 'fossgis', 'transitous', 'manual');--> statement-breakpoint
CREATE TYPE "public"."max_stops" AS ENUM('any', 'nonstop', 'one', 'two');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."option_kind" AS ENUM('flight', 'lodging', 'activity', 'transport', 'other');--> statement-breakpoint
CREATE TYPE "public"."option_status" AS ENUM('shortlisted', 'selected', 'booked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."split_method" AS ENUM('equal', 'exact', 'shares');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('planning', 'booked', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid,
	"verb" text NOT NULL,
	"summary" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"option_id" uuid,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"traveler_id" uuid NOT NULL,
	"share_base" numeric(12, 2) NOT NULL,
	"shares" numeric(10, 4),
	"exact_amount" numeric(12, 2),
	CONSTRAINT "expense_shares_expense_id_traveler_id_pk" PRIMARY KEY("expense_id","traveler_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(18, 8) NOT NULL,
	"amount_base" numeric(12, 2) NOT NULL,
	"spent_on" date NOT NULL,
	"paid_by_traveler_id" uuid NOT NULL,
	"split_method" "split_method" NOT NULL,
	"option_id" uuid,
	"itinerary_item_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request" jsonb NOT NULL,
	"status" "flight_search_status" DEFAULT 'queued' NOT NULL,
	"total" integer NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day" date,
	"start_time" time,
	"end_time" time,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" "item_kind" NOT NULL,
	"option_id" uuid,
	"title" text NOT NULL,
	"location" jsonb,
	"duration_min" integer,
	"locked" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"notes" text,
	"planned_cost" numeric(12, 2),
	"planned_currency" char(3),
	"outcome" "item_outcome" DEFAULT 'planned' NOT NULL,
	"outcome_notes" text,
	"rating" smallint,
	"unplanned" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_items_rating_chk" CHECK ("itinerary_items"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day" date,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_votes" (
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_votes_option_id_user_id_pk" PRIMARY KEY("option_id","user_id"),
	CONSTRAINT "option_votes_value_chk" CHECK ("option_votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"cache_hit" boolean NOT NULL,
	"ok" boolean NOT NULL,
	"error_kind" text,
	"duration_ms" integer NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"trip_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_item_id" uuid NOT NULL,
	"to_item_id" uuid NOT NULL,
	"mode" "leg_mode" NOT NULL,
	"duration_min" integer,
	"distance_m" integer,
	"summary" text,
	"source" "leg_source" NOT NULL,
	"details" jsonb,
	"deep_link" text,
	"chosen" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_legs_pair_mode_uniq" UNIQUE("from_item_id","to_item_id","mode")
);
--> statement-breakpoint
CREATE TABLE "travelers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_members_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trip_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" "option_kind" NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"subtitle" text,
	"data" jsonb NOT NULL,
	"price_amount" numeric(12, 2),
	"price_currency" char(3),
	"lat" double precision,
	"lon" double precision,
	"status" "option_status" DEFAULT 'shortlisted' NOT NULL,
	"booking_ref" text,
	"booking_url" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "trip_status" DEFAULT 'planning' NOT NULL,
	"origin" jsonb NOT NULL,
	"destination" jsonb NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children_ages" integer[] DEFAULT '{}' NOT NULL,
	"cabin" "cabin_class" DEFAULT 'economy' NOT NULL,
	"max_stops" "max_stops" DEFAULT 'any' NOT NULL,
	"date_strategy" jsonb NOT NULL,
	"time_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"home_timezone" text DEFAULT 'America/New_York' NOT NULL,
	"default_currency" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_option_id_trip_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_traveler_id_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."travelers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_traveler_id_travelers_id_fk" FOREIGN KEY ("paid_by_traveler_id") REFERENCES "public"."travelers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_option_id_trip_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_itinerary_item_id_itinerary_items_id_fk" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_option_id_trip_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_votes" ADD CONSTRAINT "option_votes_option_id_trip_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_votes" ADD CONSTRAINT "option_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_legs" ADD CONSTRAINT "transport_legs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_legs" ADD CONSTRAINT "transport_legs_from_item_id_itinerary_items_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_legs" ADD CONSTRAINT "transport_legs_to_item_id_itinerary_items_id_fk" FOREIGN KEY ("to_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_options" ADD CONSTRAINT "trip_options_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_options" ADD CONSTRAINT "trip_options_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_trip_created_idx" ON "activity_events" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE INDEX "itinerary_items_trip_day_idx" ON "itinerary_items" USING btree ("trip_id","day","sort_order");--> statement-breakpoint
CREATE INDEX "provider_cache_expires_at_idx" ON "provider_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "provider_calls_provider_created_idx" ON "provider_calls" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "travelers_trip_user_uniq" ON "travelers" USING btree ("trip_id","user_id") WHERE "travelers"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_options_external_uniq" ON "trip_options" USING btree ("trip_id","kind","source","external_id") WHERE "trip_options"."external_id" is not null;