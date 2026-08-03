CREATE TYPE "public"."backcharge_status" AS ENUM('recoverable', 'expired', 'no_sub_assigned', 'disputed', 'issued', 'collected', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('submitted', 'triaged', 'under_review', 'approved', 'scheduled', 'in_progress', 'completed', 'verified', 'denied', 'referred', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."determination_outcome" AS ENUM('covered', 'not_covered_excluded', 'not_covered_expired', 'not_covered_tolerance', 'homeowner_maintenance', 'manufacturer_warranty', 'insurance_claim', 'goodwill');--> statement-breakpoint
CREATE TYPE "public"."milestone_kind" AS ENUM('orientation', 'thirty_day', 'eleven_month');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'scheduled', 'completed', 'missed', 'waived');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('builder_admin', 'warranty_coordinator', 'superintendent', 'homeowner');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('emergency', 'urgent', 'routine', 'cosmetic');--> statement-breakpoint
CREATE TYPE "public"."trade" AS ENUM('concrete', 'framing', 'roofing', 'plumbing', 'electrical', 'hvac', 'insulation', 'drywall', 'paint', 'trim_carpentry', 'cabinets', 'countertops', 'flooring', 'tile', 'windows_doors', 'siding_stucco', 'gutters', 'garage_door', 'landscape_grading', 'appliances', 'low_voltage', 'other');--> statement-breakpoint
CREATE TYPE "public"."warranty_start_source" AS ENUM('closing_date', 'certificate_of_occupancy', 'possession_date', 'first_occupancy', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."warranty_tier" AS ENUM('workmanship', 'systems', 'structural');--> statement-breakpoint
CREATE TABLE "ai_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"model" varchar(80) NOT NULL,
	"prompt_version" varchar(20) NOT NULL,
	"trade" "trade" NOT NULL,
	"tier" "warranty_tier" NOT NULL,
	"severity" "severity" NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"proposed_outcome" "determination_outcome" NOT NULL,
	"confidence" double precision NOT NULL,
	"needs_human_review" boolean DEFAULT true NOT NULL,
	"summary" text NOT NULL,
	"observed_condition" text NOT NULL,
	"recommended_next_step" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tolerance_check" jsonb,
	"possible_duplicate_of_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_claims" (
	"appointment_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	CONSTRAINT "appointment_claims_appointment_id_claim_id_pk" PRIMARY KEY("appointment_id","claim_id")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"subcontractor_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"window_minutes" integer DEFAULT 120 NOT NULL,
	"homeowner_confirmed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backcharges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"subcontractor_id" uuid,
	"sub_assignment_id" uuid,
	"status" "backcharge_status" NOT NULL,
	"amount_cents" integer,
	"rationale" text NOT NULL,
	"days_late" integer,
	"issued_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"state" varchar(2) NOT NULL,
	"phone" varchar(32),
	"support_email" varchar(200),
	"tier_months_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "builders_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" varchar(60) NOT NULL,
	"from_status" "claim_status",
	"to_status" "claim_status",
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid,
	"uploaded_by_user_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"byte_size" integer NOT NULL,
	"exif_taken_at" timestamp with time zone,
	"latitude" double precision,
	"longitude" double precision,
	"geo_verified" boolean,
	"distance_from_home_meters" double precision,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"reference" varchar(24) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"room" varchar(80),
	"status" "claim_status" DEFAULT 'submitted' NOT NULL,
	"reported_severity" "severity" DEFAULT 'routine' NOT NULL,
	"assessed_severity" "severity",
	"trade" "trade",
	"tier" "warranty_tier",
	"reported_on" date NOT NULL,
	"statutory_notice_sent_at" timestamp with time zone,
	"statutory_response_due_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"city" varchar(120) NOT NULL,
	"state" varchar(2) NOT NULL,
	"postal_code" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tier" "warranty_tier",
	"trade" "trade",
	"heading" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"is_coverage" boolean DEFAULT true NOT NULL,
	"page_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "determinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"decided_by_user_id" uuid NOT NULL,
	"outcome" "determination_outcome" NOT NULL,
	"tier" "warranty_tier",
	"trade" "trade",
	"reason" text NOT NULL,
	"ai_assessment_id" uuid,
	"agreed_with_ai" boolean,
	"responsible_subcontractor_id" uuid,
	"estimated_cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_original_owner" boolean DEFAULT true NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"plan_id" uuid,
	"lot_number" varchar(32) NOT NULL,
	"address_line1" varchar(200) NOT NULL,
	"address_line2" varchar(200),
	"city" varchar(120) NOT NULL,
	"state" varchar(2) NOT NULL,
	"postal_code" varchar(12) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"closing_date" date,
	"certificate_of_occupancy_date" date,
	"possession_date" date,
	"warranty_start_date" date NOT NULL,
	"warranty_start_source" "warranty_start_source" NOT NULL,
	"warranty_start_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"kind" "milestone_kind" NOT NULL,
	"due_date" date NOT NULL,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"elevation" varchar(40),
	"square_feet" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"subcontractor_id" uuid NOT NULL,
	"trade" "trade" NOT NULL,
	"scope_description" text,
	"completed_at" date,
	"sub_warranty_start" date,
	"sub_warranty_months" integer DEFAULT 12 NOT NULL,
	"contract_reference" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"primary_trade" "trade" NOT NULL,
	"contact_name" varchar(120),
	"email" varchar(200),
	"phone" varchar(32),
	"insurance_expires_on" date,
	"default_warranty_months" integer DEFAULT 12 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"phone" varchar(32),
	"role" "role" NOT NULL,
	"builder_id" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"tier" "warranty_tier" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"administrator" varchar(160),
	"policy_number" varchar(80),
	"document_id" uuid,
	"transfers_on_resale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranty_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_id" uuid NOT NULL,
	"home_id" uuid,
	"title" varchar(200) NOT NULL,
	"file_url" text,
	"extracted_text" text,
	"effective_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_assessments" ADD CONSTRAINT "ai_assessments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_claims" ADD CONSTRAINT "appointment_claims_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_claims" ADD CONSTRAINT "appointment_claims_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backcharges" ADD CONSTRAINT "backcharges_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backcharges" ADD CONSTRAINT "backcharges_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backcharges" ADD CONSTRAINT "backcharges_sub_assignment_id_sub_assignments_id_fk" FOREIGN KEY ("sub_assignment_id") REFERENCES "public"."sub_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_photos" ADD CONSTRAINT "claim_photos_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_photos" ADD CONSTRAINT "claim_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_terms" ADD CONSTRAINT "coverage_terms_document_id_warranty_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."warranty_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_ai_assessment_id_ai_assessments_id_fk" FOREIGN KEY ("ai_assessment_id") REFERENCES "public"."ai_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "determinations" ADD CONSTRAINT "determinations_responsible_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("responsible_subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_ownerships" ADD CONSTRAINT "home_ownerships_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_ownerships" ADD CONSTRAINT "home_ownerships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_assignments" ADD CONSTRAINT "sub_assignments_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_assignments" ADD CONSTRAINT "sub_assignments_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_document_id_warranty_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."warranty_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_documents" ADD CONSTRAINT "warranty_documents_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_documents" ADD CONSTRAINT "warranty_documents_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_assessments_claim_idx" ON "ai_assessments" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "appointments_home_idx" ON "appointments" USING btree ("home_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "backcharges_claim_idx" ON "backcharges" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "backcharges_sub_idx" ON "backcharges" USING btree ("subcontractor_id","status");--> statement-breakpoint
CREATE INDEX "claim_events_claim_idx" ON "claim_events" USING btree ("claim_id","created_at");--> statement-breakpoint
CREATE INDEX "claim_photos_claim_idx" ON "claim_photos" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_reference_unique" ON "claims" USING btree ("builder_id","reference");--> statement-breakpoint
CREATE INDEX "claims_home_idx" ON "claims" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "claims_builder_status_idx" ON "claims" USING btree ("builder_id","status");--> statement-breakpoint
CREATE INDEX "claims_trade_idx" ON "claims" USING btree ("trade");--> statement-breakpoint
CREATE INDEX "claims_reported_on_idx" ON "claims" USING btree ("reported_on");--> statement-breakpoint
CREATE INDEX "communities_builder_idx" ON "communities" USING btree ("builder_id");--> statement-breakpoint
CREATE INDEX "coverage_terms_document_idx" ON "coverage_terms" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "determinations_claim_idx" ON "determinations" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "home_ownerships_home_idx" ON "home_ownerships" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "home_ownerships_user_idx" ON "home_ownerships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "homes_lot_unique" ON "homes" USING btree ("community_id","lot_number");--> statement-breakpoint
CREATE INDEX "homes_builder_idx" ON "homes" USING btree ("builder_id");--> statement-breakpoint
CREATE INDEX "homes_plan_idx" ON "homes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "homes_warranty_start_idx" ON "homes" USING btree ("warranty_start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_home_kind_unique" ON "milestones" USING btree ("home_id","kind");--> statement-breakpoint
CREATE INDEX "milestones_due_idx" ON "milestones" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "plans_builder_idx" ON "plans" USING btree ("builder_id");--> statement-breakpoint
CREATE INDEX "sub_assignments_home_idx" ON "sub_assignments" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "sub_assignments_sub_idx" ON "sub_assignments" USING btree ("subcontractor_id");--> statement-breakpoint
CREATE INDEX "sub_assignments_trade_idx" ON "sub_assignments" USING btree ("trade");--> statement-breakpoint
CREATE INDEX "subcontractors_builder_idx" ON "subcontractors" USING btree ("builder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_builder_idx" ON "users" USING btree ("builder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warranties_home_tier_unique" ON "warranties" USING btree ("home_id","tier");--> statement-breakpoint
CREATE INDEX "warranties_end_date_idx" ON "warranties" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "warranty_documents_builder_idx" ON "warranty_documents" USING btree ("builder_id");