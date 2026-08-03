import {
  BACKCHARGE_STATUSES,
  CLAIM_STATUSES,
  DETERMINATION_OUTCOMES,
  MILESTONE_KINDS,
  MILESTONE_STATUSES,
  ROLES,
  SEVERITIES,
  TRADES,
  WARRANTY_START_SOURCES,
  WARRANTY_TIERS,
} from "@warranted/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// enums — mirrored from @warranted/shared so the DB enforces the same vocabulary
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ROLES);
export const warrantyTierEnum = pgEnum("warranty_tier", WARRANTY_TIERS);
export const tradeEnum = pgEnum("trade", TRADES);
export const claimStatusEnum = pgEnum("claim_status", CLAIM_STATUSES);
export const severityEnum = pgEnum("severity", SEVERITIES);
export const determinationOutcomeEnum = pgEnum(
  "determination_outcome",
  DETERMINATION_OUTCOMES,
);
export const milestoneKindEnum = pgEnum("milestone_kind", MILESTONE_KINDS);
export const milestoneStatusEnum = pgEnum("milestone_status", MILESTONE_STATUSES);
export const warrantyStartSourceEnum = pgEnum(
  "warranty_start_source",
  WARRANTY_START_SOURCES,
);
export const backchargeStatusEnum = pgEnum("backcharge_status", BACKCHARGE_STATUSES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ---------------------------------------------------------------------------
// tenancy
// ---------------------------------------------------------------------------

/** A builder company. The tenant boundary — everything scopes to one of these. */
export const builders = pgTable("builders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  /** Governs which right-to-cure statute applies. */
  state: varchar("state", { length: 2 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  supportEmail: varchar("support_email", { length: 200 }),
  /**
   * Per-builder tier durations, e.g. {"workmanship": 24} for a 2-5-10 program.
   * Null falls back to the 1-2-10 defaults in @warranted/shared.
   */
  tierMonthsOverride: jsonb("tier_months_override").$type<
    Partial<Record<(typeof WARRANTY_TIERS)[number], number>>
  >(),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 200 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    role: roleEnum("role").notNull(),
    /** Null for homeowners — they belong to homes, not to a builder org. */
    builderId: uuid("builder_id").references(() => builders.id, {
      onDelete: "cascade",
    }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_builder_idx").on(t.builderId),
  ],
);

// ---------------------------------------------------------------------------
// portfolio
// ---------------------------------------------------------------------------

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    postalCode: varchar("postal_code", { length: 12 }),
    ...timestamps,
  },
  (t) => [index("communities_builder_idx").on(t.builderId)],
);

/**
 * A floor plan. Homes reference it so a defect recurring across the same plan
 * can be detected as a design or installation pattern rather than a one-off.
 */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    elevation: varchar("elevation", { length: 40 }),
    squareFeet: integer("square_feet"),
    ...timestamps,
  },
  (t) => [index("plans_builder_idx").on(t.builderId)],
);

export const homes = pgTable(
  "homes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    lotNumber: varchar("lot_number", { length: 32 }).notNull(),

    addressLine1: varchar("address_line1", { length: 200 }).notNull(),
    addressLine2: varchar("address_line2", { length: 200 }),
    city: varchar("city", { length: 120 }).notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    postalCode: varchar("postal_code", { length: 12 }).notNull(),
    /** Used to verify claim photo geotags against the lot. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    // These three routinely differ, and warranty documents disagree about
    // which one governs. All are recorded; none is authoritative by itself.
    closingDate: date("closing_date"),
    certificateOfOccupancyDate: date("certificate_of_occupancy_date"),
    possessionDate: date("possession_date"),

    /**
     * The date the clock actually runs from — explicit, sourced, and auditable
     * rather than derived. This is the single most-disputed field in warranty
     * administration, so it carries its own provenance.
     */
    warrantyStartDate: date("warranty_start_date").notNull(),
    warrantyStartSource: warrantyStartSourceEnum("warranty_start_source").notNull(),
    warrantyStartNote: text("warranty_start_note"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("homes_lot_unique").on(t.communityId, t.lotNumber),
    index("homes_builder_idx").on(t.builderId),
    index("homes_plan_idx").on(t.planId),
    index("homes_warranty_start_idx").on(t.warrantyStartDate),
  ],
);

/**
 * Who owns a home, and when. Modeled as a history rather than a column so
 * resale works: structural coverage typically transfers to a subsequent owner
 * while workmanship typically does not, and a prior owner still needs read
 * access to claims they filed.
 */
export const homeOwnerships = pgTable(
  "home_ownerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isOriginalOwner: boolean("is_original_owner").notNull().default(true),
    startedAt: date("started_at").notNull(),
    /** Null while current. */
    endedAt: date("ended_at"),
    ...timestamps,
  },
  (t) => [
    index("home_ownerships_home_idx").on(t.homeId),
    index("home_ownerships_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// warranty terms
// ---------------------------------------------------------------------------

/** The source PDF, retained so every determination can cite a real document. */
export const warrantyDocuments = pgTable(
  "warranty_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    /** Null when it's the builder's standard program rather than lot-specific. */
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    fileUrl: text("file_url"),
    /** Extracted text, fed to triage as grounding context. */
    extractedText: text("extracted_text"),
    effectiveDate: date("effective_date"),
    ...timestamps,
  },
  (t) => [index("warranty_documents_builder_idx").on(t.builderId)],
);

export const warranties = pgTable(
  "warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    tier: warrantyTierEnum("tier").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Third-party administrator, when the tier is insurer-backed. */
    administrator: varchar("administrator", { length: 160 }),
    policyNumber: varchar("policy_number", { length: 80 }),
    documentId: uuid("document_id").references(() => warrantyDocuments.id, {
      onDelete: "set null",
    }),
    /** Structural usually transfers on resale; workmanship usually does not. */
    transfersOnResale: boolean("transfers_on_resale").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("warranties_home_tier_unique").on(t.homeId, t.tier),
    index("warranties_end_date_idx").on(t.endDate),
  ],
);

/**
 * Individual clauses parsed out of a warranty document, so a determination can
 * quote the specific term it relied on instead of gesturing at a whole PDF.
 */
export const coverageTerms = pgTable(
  "coverage_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => warrantyDocuments.id, { onDelete: "cascade" }),
    tier: warrantyTierEnum("tier"),
    trade: tradeEnum("trade"),
    heading: varchar("heading", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** False for exclusions — the clauses that deny rather than grant. */
    isCoverage: boolean("is_coverage").notNull().default(true),
    pageNumber: integer("page_number"),
    ...timestamps,
  },
  (t) => [index("coverage_terms_document_idx").on(t.documentId)],
);

/**
 * The builder's performance standard: the table that decides whether an
 * observed condition is a defect or is within acceptable tolerance.
 *
 * This exists as a table rather than staying in code for a licensing reason as
 * much as a product one. `packages/warranty/src/tolerances.ts` ships
 * widely-cited approximations as a structural placeholder, because the NAHB
 * *Residential Construction Performance Guidelines* are copyrighted. A builder
 * running this commercially has to supply their own published standard, an
 * applicable state standard, or a licensed copy. Rows here override the
 * built-in set for that builder; with no rows, the placeholder is used and the
 * portal says so.
 *
 * `code` is the stable key an AI citation points at, so it is unique per
 * builder and should read like the built-ins ("drywall.crack").
 */
export const performanceTolerances = pgTable(
  "performance_tolerances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 120 }).notNull(),
    trade: tradeEnum("trade").notNull(),
    /** Plain-language condition a homeowner would describe. */
    condition: text("condition").notNull(),
    /** The threshold at which it becomes actionable. */
    threshold: text("threshold").notNull(),
    /** Machine-comparable form, null when the condition needs human judgment. */
    measurementUnit: varchar("measurement_unit", { length: 16 }),
    measurementMax: doublePrecision("measurement_max"),
    measurementOver: varchar("measurement_over", { length: 60 }),
    typicalWindowMonths: integer("typical_window_months").notNull().default(12),
    /** Life-safety and water intrusion: no acceptable amount, at any size. */
    isZeroTolerance: boolean("is_zero_tolerance").notNull().default(false),
    notes: text("notes"),
    /** Where this value came from, which matters when it is challenged. */
    source: varchar("source", { length: 200 }),
    ...timestamps,
  },
  (t) => [
    index("performance_tolerances_builder_idx").on(t.builderId, t.trade),
    uniqueIndex("performance_tolerances_code_unique").on(t.builderId, t.code),
  ],
);

// ---------------------------------------------------------------------------
// subcontractors — the second clock
// ---------------------------------------------------------------------------

export const subcontractors = pgTable(
  "subcontractors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    companyName: varchar("company_name", { length: 200 }).notNull(),
    primaryTrade: tradeEnum("primary_trade").notNull(),
    contactName: varchar("contact_name", { length: 120 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 32 }),
    /** Lapsed insurance is its own liability; surfaced alongside warranty risk. */
    insuranceExpiresOn: date("insurance_expires_on"),
    defaultWarrantyMonths: integer("default_warranty_months").notNull().default(12),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("subcontractors_builder_idx").on(t.builderId)],
);

/**
 * Who did what on which lot — and when their clock started.
 *
 * `subWarrantyStart` defaults to `completedAt`, NOT to the home's warranty
 * start. That divergence is the exposure the product exists to surface, and
 * collapsing the two here would erase the entire thesis.
 *
 * A row with a null `completedAt` is the bus-factor failure: the builder can no
 * longer prove who did the work, so it cannot backcharge at all.
 */
export const subAssignments = pgTable(
  "sub_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    subcontractorId: uuid("subcontractor_id")
      .notNull()
      .references(() => subcontractors.id, { onDelete: "restrict" }),
    trade: tradeEnum("trade").notNull(),
    scopeDescription: text("scope_description"),
    completedAt: date("completed_at"),
    subWarrantyStart: date("sub_warranty_start"),
    subWarrantyMonths: integer("sub_warranty_months").notNull().default(12),
    contractReference: varchar("contract_reference", { length: 120 }),
    ...timestamps,
  },
  (t) => [
    index("sub_assignments_home_idx").on(t.homeId),
    index("sub_assignments_sub_idx").on(t.subcontractorId),
    index("sub_assignments_trade_idx").on(t.trade),
  ],
);

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => builders.id, { onDelete: "cascade" }),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Human-facing sequential reference, e.g. "WC-1042". */
    reference: varchar("reference", { length: 24 }).notNull(),

    title: varchar("title", { length: 160 }).notNull(),
    description: text("description").notNull(),
    room: varchar("room", { length: 80 }),

    status: claimStatusEnum("status").notNull().default("submitted"),
    reportedSeverity: severityEnum("reported_severity").notNull().default("routine"),
    /** Set by triage or a coordinator; may differ from what was reported. */
    assessedSeverity: severityEnum("assessed_severity"),
    trade: tradeEnum("trade"),
    tier: warrantyTierEnum("tier"),

    /**
     * Filing date drives every coverage question, so it is stored explicitly
     * rather than read off createdAt — backdated paper claims get entered too.
     */
    reportedOn: date("reported_on").notNull(),

    /**
     * Right-to-cure tracking. Most states require written notice and a defined
     * builder response window before a homeowner can sue; a timestamped log of
     * both is the builder's defense.
     */
    statutoryNoticeSentAt: timestamp("statutory_notice_sent_at", {
      withTimezone: true,
    }),
    statutoryResponseDueAt: timestamp("statutory_response_due_at", {
      withTimezone: true,
    }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),

    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("claims_reference_unique").on(t.builderId, t.reference),
    index("claims_home_idx").on(t.homeId),
    index("claims_builder_status_idx").on(t.builderId, t.status),
    index("claims_trade_idx").on(t.trade),
    index("claims_reported_on_idx").on(t.reportedOn),
  ],
);

/**
 * Photo evidence. EXIF timestamp and coordinates are stored separately from
 * upload time — a photo whose EXIF predates the claim by months, or whose
 * geotag is nowhere near the lot, is flagged rather than trusted. That kills
 * the "you took that at your old house" dispute class for nearly free.
 */
export const claimPhotos = pgTable(
  "claim_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    fileUrl: text("file_url").notNull(),
    contentType: varchar("content_type", { length: 80 }).notNull(),
    byteSize: integer("byte_size").notNull(),

    exifTakenAt: timestamp("exif_taken_at", { withTimezone: true }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Null when the photo carries no geotag to check. */
    geoVerified: boolean("geo_verified"),
    distanceFromHomeMeters: doublePrecision("distance_from_home_meters"),

    width: integer("width"),
    height: integer("height"),
    ...timestamps,
  },
  (t) => [index("claim_photos_claim_idx").on(t.claimId)],
);

/** Append-only audit trail. Who did what, when — the bus-factor insurance. */
export const claimEvents = pgTable(
  "claim_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** e.g. "status_changed", "photo_added", "ai_triaged", "notice_sent". */
    kind: varchar("kind", { length: 60 }).notNull(),
    fromStatus: claimStatusEnum("from_status"),
    toStatus: claimStatusEnum("to_status"),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("claim_events_claim_idx").on(t.claimId, t.createdAt)],
);

/**
 * What the model proposed. Stored separately from `determinations` so the
 * human decision and the machine suggestion are never conflated — and so
 * every agreement or override becomes labeled evaluation data.
 */
export const aiAssessments = pgTable(
  "ai_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    model: varchar("model", { length: 80 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 20 }).notNull(),

    trade: tradeEnum("trade").notNull(),
    tier: warrantyTierEnum("tier").notNull(),
    severity: severityEnum("severity").notNull(),
    isEmergency: boolean("is_emergency").notNull().default(false),
    proposedOutcome: determinationOutcomeEnum("proposed_outcome").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    needsHumanReview: boolean("needs_human_review").notNull().default(true),

    summary: text("summary").notNull(),
    observedCondition: text("observed_condition").notNull(),
    recommendedNextStep: text("recommended_next_step").notNull(),

    /** Clause and tolerance references. Uncited proposals are low-trust. */
    citations: jsonb("citations")
      .$type<
        Array<{
          source: "warranty_document" | "performance_tolerance" | "statute";
          reference: string;
          quote: string;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    toleranceCheck: jsonb("tolerance_check").$type<{
      applies: boolean;
      standard: string;
      threshold: string;
      estimatedMeasurement: string | null;
      withinTolerance: boolean | null;
    } | null>(),
    possibleDuplicateOfClaimIds: jsonb("possible_duplicate_of_claim_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_assessments_claim_idx").on(t.claimId)],
);

/** The human decision. Always required — the model never decides alone. */
export const determinations = pgTable(
  "determinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    outcome: determinationOutcomeEnum("outcome").notNull(),
    tier: warrantyTierEnum("tier"),
    trade: tradeEnum("trade"),
    reason: text("reason").notNull(),

    /** Links the decision to the suggestion it accepted or overrode. */
    aiAssessmentId: uuid("ai_assessment_id").references(() => aiAssessments.id, {
      onDelete: "set null",
    }),
    agreedWithAi: boolean("agreed_with_ai"),

    responsibleSubcontractorId: uuid("responsible_subcontractor_id").references(
      () => subcontractors.id,
      { onDelete: "set null" },
    ),
    estimatedCostCents: integer("estimated_cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("determinations_claim_idx").on(t.claimId)],
);

// ---------------------------------------------------------------------------
// scheduling and recovery
// ---------------------------------------------------------------------------

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    kind: milestoneKindEnum("kind").notNull(),
    dueDate: date("due_date").notNull(),
    status: milestoneStatusEnum("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("milestones_home_kind_unique").on(t.homeId, t.kind),
    index("milestones_due_idx").on(t.dueDate, t.status),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    subcontractorId: uuid("subcontractor_id").references(() => subcontractors.id, {
      onDelete: "set null",
    }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    windowMinutes: integer("window_minutes").notNull().default(120),
    /** Coordinator proposes; homeowner confirms. Unconfirmed is a wasted trip. */
    homeownerConfirmed: boolean("homeowner_confirmed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("appointments_home_idx").on(t.homeId, t.scheduledFor)],
);

/** Batching several claims into one visit is the main scheduling lever. */
export const appointmentClaims = pgTable(
  "appointment_claims",
  {
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.appointmentId, t.claimId] })],
);

/**
 * Cost recovery against the sub who did the work. `status` is computed at
 * claim time rather than at invoice time — knowing a window is about to close
 * while it is still open is the whole difference between a backcharge and a
 * write-off.
 */
export const backcharges = pgTable(
  "backcharges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    subcontractorId: uuid("subcontractor_id").references(() => subcontractors.id, {
      onDelete: "set null",
    }),
    subAssignmentId: uuid("sub_assignment_id").references(() => subAssignments.id, {
      onDelete: "set null",
    }),
    status: backchargeStatusEnum("status").notNull(),
    amountCents: integer("amount_cents"),
    /** Why it was or wasn't recoverable, captured at the moment of decision. */
    rationale: text("rationale").notNull(),
    daysLate: integer("days_late"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("backcharges_claim_idx").on(t.claimId),
    index("backcharges_sub_idx").on(t.subcontractorId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// relations
// ---------------------------------------------------------------------------

export const buildersRelations = relations(builders, ({ many }) => ({
  users: many(users),
  communities: many(communities),
  plans: many(plans),
  homes: many(homes),
  subcontractors: many(subcontractors),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  builder: one(builders, {
    fields: [users.builderId],
    references: [builders.id],
  }),
  ownerships: many(homeOwnerships),
  claims: many(claims),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  builder: one(builders, {
    fields: [communities.builderId],
    references: [builders.id],
  }),
  homes: many(homes),
}));

export const homesRelations = relations(homes, ({ one, many }) => ({
  builder: one(builders, { fields: [homes.builderId], references: [builders.id] }),
  community: one(communities, {
    fields: [homes.communityId],
    references: [communities.id],
  }),
  plan: one(plans, { fields: [homes.planId], references: [plans.id] }),
  ownerships: many(homeOwnerships),
  warranties: many(warranties),
  subAssignments: many(subAssignments),
  claims: many(claims),
  milestones: many(milestones),
  appointments: many(appointments),
}));

export const homeOwnershipsRelations = relations(homeOwnerships, ({ one }) => ({
  home: one(homes, { fields: [homeOwnerships.homeId], references: [homes.id] }),
  user: one(users, { fields: [homeOwnerships.userId], references: [users.id] }),
}));

export const warrantiesRelations = relations(warranties, ({ one }) => ({
  home: one(homes, { fields: [warranties.homeId], references: [homes.id] }),
  document: one(warrantyDocuments, {
    fields: [warranties.documentId],
    references: [warrantyDocuments.id],
  }),
}));

export const warrantyDocumentsRelations = relations(
  warrantyDocuments,
  ({ one, many }) => ({
    builder: one(builders, {
      fields: [warrantyDocuments.builderId],
      references: [builders.id],
    }),
    home: one(homes, {
      fields: [warrantyDocuments.homeId],
      references: [homes.id],
    }),
    terms: many(coverageTerms),
  }),
);

export const coverageTermsRelations = relations(coverageTerms, ({ one }) => ({
  document: one(warrantyDocuments, {
    fields: [coverageTerms.documentId],
    references: [warrantyDocuments.id],
  }),
}));

export const subcontractorsRelations = relations(subcontractors, ({ one, many }) => ({
  builder: one(builders, {
    fields: [subcontractors.builderId],
    references: [builders.id],
  }),
  assignments: many(subAssignments),
  backcharges: many(backcharges),
}));

export const subAssignmentsRelations = relations(subAssignments, ({ one }) => ({
  home: one(homes, { fields: [subAssignments.homeId], references: [homes.id] }),
  subcontractor: one(subcontractors, {
    fields: [subAssignments.subcontractorId],
    references: [subcontractors.id],
  }),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  home: one(homes, { fields: [claims.homeId], references: [homes.id] }),
  builder: one(builders, { fields: [claims.builderId], references: [builders.id] }),
  reportedBy: one(users, {
    fields: [claims.reportedByUserId],
    references: [users.id],
  }),
  photos: many(claimPhotos),
  events: many(claimEvents),
  assessments: many(aiAssessments),
  determinations: many(determinations),
  backcharges: many(backcharges),
}));

export const claimPhotosRelations = relations(claimPhotos, ({ one }) => ({
  claim: one(claims, { fields: [claimPhotos.claimId], references: [claims.id] }),
  uploadedBy: one(users, {
    fields: [claimPhotos.uploadedByUserId],
    references: [users.id],
  }),
}));

export const claimEventsRelations = relations(claimEvents, ({ one }) => ({
  claim: one(claims, { fields: [claimEvents.claimId], references: [claims.id] }),
  actor: one(users, { fields: [claimEvents.actorUserId], references: [users.id] }),
}));

export const aiAssessmentsRelations = relations(aiAssessments, ({ one }) => ({
  claim: one(claims, { fields: [aiAssessments.claimId], references: [claims.id] }),
}));

export const determinationsRelations = relations(determinations, ({ one }) => ({
  claim: one(claims, { fields: [determinations.claimId], references: [claims.id] }),
  decidedBy: one(users, {
    fields: [determinations.decidedByUserId],
    references: [users.id],
  }),
  assessment: one(aiAssessments, {
    fields: [determinations.aiAssessmentId],
    references: [aiAssessments.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  home: one(homes, { fields: [milestones.homeId], references: [homes.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  home: one(homes, { fields: [appointments.homeId], references: [homes.id] }),
  subcontractor: one(subcontractors, {
    fields: [appointments.subcontractorId],
    references: [subcontractors.id],
  }),
  claims: many(appointmentClaims),
}));

export const appointmentClaimsRelations = relations(appointmentClaims, ({ one }) => ({
  appointment: one(appointments, {
    fields: [appointmentClaims.appointmentId],
    references: [appointments.id],
  }),
  claim: one(claims, {
    fields: [appointmentClaims.claimId],
    references: [claims.id],
  }),
}));

export const backchargesRelations = relations(backcharges, ({ one }) => ({
  claim: one(claims, { fields: [backcharges.claimId], references: [claims.id] }),
  subcontractor: one(subcontractors, {
    fields: [backcharges.subcontractorId],
    references: [subcontractors.id],
  }),
}));
