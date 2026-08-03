CREATE TABLE "performance_tolerances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"code" varchar(120) NOT NULL,
	"trade" "trade" NOT NULL,
	"condition" text NOT NULL,
	"threshold" text NOT NULL,
	"measurement_unit" varchar(16),
	"measurement_max" double precision,
	"measurement_over" varchar(60),
	"typical_window_months" integer DEFAULT 12 NOT NULL,
	"is_zero_tolerance" boolean DEFAULT false NOT NULL,
	"notes" text,
	"source" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_tolerances" ADD CONSTRAINT "performance_tolerances_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_tolerances_builder_idx" ON "performance_tolerances" USING btree ("builder_id","trade");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_tolerances_code_unique" ON "performance_tolerances" USING btree ("builder_id","code");