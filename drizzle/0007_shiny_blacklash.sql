CREATE TABLE "option_price_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price_cents" integer,
	"currency" text,
	"available" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "option_price_checks" ADD CONSTRAINT "option_price_checks_option_id_trip_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "option_price_checks_option_idx" ON "option_price_checks" USING btree ("option_id","checked_at");