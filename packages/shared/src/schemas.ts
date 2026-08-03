import { z } from "zod";
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
} from "./enums";

export const roleSchema = z.enum(ROLES);
export const tradeSchema = z.enum(TRADES);
export const severitySchema = z.enum(SEVERITIES);
export const claimStatusSchema = z.enum(CLAIM_STATUSES);
export const warrantyTierSchema = z.enum(WARRANTY_TIERS);
export const determinationOutcomeSchema = z.enum(DETERMINATION_OUTCOMES);
export const milestoneKindSchema = z.enum(MILESTONE_KINDS);
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);
export const warrantyStartSourceSchema = z.enum(WARRANTY_START_SOURCES);
export const backchargeStatusSchema = z.enum(BACKCHARGE_STATUSES);

/** ISO date-only string, e.g. "2026-03-14". Warranty math is day-precision. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, "use at least 12 characters")
    .max(200, "that's too long"),
  fullName: z.string().min(1).max(120),
  phone: z.string().max(32).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: roleSchema,
  builderId: z.string().uuid().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------

/**
 * Photo metadata captured on-device. `takenAt` and the coordinates come from
 * EXIF, not from the upload time — that distinction is the whole evidentiary
 * point. A photo whose EXIF timestamp predates the claim by six months, or
 * whose coordinates are nowhere near the lot, gets flagged rather than trusted.
 */
export const photoMetadataSchema = z.object({
  takenAt: z.string().datetime().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;

export const createClaimSchema = z.object({
  homeId: z.string().uuid(),
  title: z.string().min(3, "give it a short title").max(160),
  description: z.string().min(1, "describe what you're seeing").max(4000),
  room: z.string().max(80).optional(),
  /** Homeowner's own read on urgency. AI and coordinator may revise it. */
  reportedSeverity: severitySchema.default("routine"),
  photoIds: z.array(z.string().uuid()).max(20).default([]),
});
export type CreateClaimInput = z.infer<typeof createClaimSchema>;

export const updateClaimStatusSchema = z.object({
  status: claimStatusSchema,
  note: z.string().max(2000).optional(),
});
export type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;

/**
 * A coordinator's decision. `aiAssessmentId` and `agreedWithAi` are recorded so
 * every override becomes labeled data for evaluating triage quality.
 */
export const createDeterminationSchema = z.object({
  outcome: determinationOutcomeSchema,
  tier: warrantyTierSchema.nullable().default(null),
  trade: tradeSchema.nullable().default(null),
  reason: z.string().min(1, "a reason is required").max(2000),
  aiAssessmentId: z.string().uuid().nullable().default(null),
  agreedWithAi: z.boolean().nullable().default(null),
  responsibleSubcontractorId: z.string().uuid().nullable().default(null),
  estimatedCostCents: z.number().int().nonnegative().nullable().default(null),
});
export type CreateDeterminationInput = z.infer<typeof createDeterminationSchema>;

// ---------------------------------------------------------------------------
// AI triage
// ---------------------------------------------------------------------------

/**
 * What the model returns. Note it proposes a determination and must cite the
 * clause or tolerance it relied on — a proposal with no citation is treated as
 * low confidence regardless of what the model claims.
 */
export const aiAssessmentSchema = z.object({
  trade: tradeSchema,
  tier: warrantyTierSchema,
  severity: severitySchema,
  isEmergency: z.boolean(),
  summary: z.string().max(500),
  observedCondition: z
    .string()
    .max(1000)
    .describe("What is visible in the photos, stated factually"),
  proposedOutcome: determinationOutcomeSchema,
  confidence: z.number().min(0).max(1),
  citations: z
    .array(
      z.object({
        source: z.enum(["warranty_document", "performance_tolerance", "statute"]),
        reference: z.string().max(200),
        quote: z.string().max(800),
      }),
    )
    .default([]),
  toleranceCheck: z
    .object({
      applies: z.boolean(),
      standard: z.string().max(200),
      threshold: z.string().max(120),
      estimatedMeasurement: z.string().max(120).nullable(),
      withinTolerance: z.boolean().nullable(),
    })
    .nullable()
    .default(null),
  possibleDuplicateOfClaimIds: z.array(z.string().uuid()).default([]),
  recommendedNextStep: z.string().max(500),
  /** Set when the model is not confident enough to be useful. */
  needsHumanReview: z.boolean().default(true),
});
export type AiAssessment = z.infer<typeof aiAssessmentSchema>;

// ---------------------------------------------------------------------------
// homes, warranties, subs
// ---------------------------------------------------------------------------

export const createCommunitySchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  state: z.string().length(2),
  postalCode: z.string().max(12).nullable().default(null),
});
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

/**
 * Elevation is separate from name on purpose. Two elevations of one plan can
 * differ in the details that fail, so collapsing them would blunt pattern
 * detection at exactly the point it earns its keep.
 */
export const createPlanSchema = z.object({
  name: z.string().min(1).max(120),
  elevation: z.string().max(40).nullable().default(null),
  squareFeet: z.number().int().min(100).max(30000).nullable().default(null),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const createSubcontractorSchema = z.object({
  companyName: z.string().min(1).max(200),
  primaryTrade: tradeSchema,
  contactName: z.string().max(120).nullable().default(null),
  email: z.string().email().max(200).nullable().default(null),
  phone: z.string().max(32).nullable().default(null),
  /** Lapsed insurance turns a backcharge into a write-off, so it is tracked. */
  insuranceExpiresOn: isoDateSchema.nullable().default(null),
  /** Their contract's warranty term, which starts at *their* completion. */
  defaultWarrantyMonths: z.number().int().min(0).max(240).default(12),
  active: z.boolean().default(true),
});
export type CreateSubcontractorInput = z.infer<typeof createSubcontractorSchema>;

export const createHomeSchema = z.object({
  communityId: z.string().uuid(),
  planId: z.string().uuid().nullable().default(null),
  lotNumber: z.string().min(1).max(32),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).nullable().default(null),
  city: z.string().min(1).max(120),
  state: z.string().length(2),
  postalCode: z.string().min(3).max(12),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  closingDate: isoDateSchema.nullable().default(null),
  certificateOfOccupancyDate: isoDateSchema.nullable().default(null),
  possessionDate: isoDateSchema.nullable().default(null),
  warrantyStartDate: isoDateSchema,
  warrantyStartSource: warrantyStartSourceSchema,
  warrantyStartNote: z.string().max(500).nullable().default(null),
});
export type CreateHomeInput = z.infer<typeof createHomeSchema>;

/**
 * The dual-clock record. `subWarrantyStart` defaults to `completedAt`, NOT to
 * the home's warranty start — that divergence is exactly the exposure this
 * product exists to surface.
 */
export const createSubAssignmentSchema = z.object({
  homeId: z.string().uuid(),
  subcontractorId: z.string().uuid(),
  trade: tradeSchema,
  scopeDescription: z.string().max(500).nullable().default(null),
  completedAt: isoDateSchema.nullable().default(null),
  subWarrantyStart: isoDateSchema.nullable().default(null),
  subWarrantyMonths: z.number().int().min(0).max(240).default(12),
  contractReference: z.string().max(120).nullable().default(null),
});
export type CreateSubAssignmentInput = z.infer<typeof createSubAssignmentSchema>;

export const scheduleAppointmentSchema = z.object({
  homeId: z.string().uuid(),
  claimIds: z.array(z.string().uuid()).min(1, "attach at least one claim"),
  subcontractorId: z.string().uuid().nullable().default(null),
  scheduledFor: z.string().datetime(),
  windowMinutes: z.number().int().min(30).max(600).default(120),
  notes: z.string().max(1000).nullable().default(null),
});
export type ScheduleAppointmentInput = z.infer<typeof scheduleAppointmentSchema>;

export const updateAppointmentSchema = z
  .object({
    scheduledFor: z.string().datetime(),
    windowMinutes: z.number().int().min(30).max(600),
    subcontractorId: z.string().uuid().nullable(),
    /** The coordinator proposes a slot; only the homeowner confirms it. */
    homeownerConfirmed: z.boolean(),
    completed: z.boolean(),
    notes: z.string().max(1000).nullable(),
  })
  .partial();
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

/**
 * Moving a backcharge along its lifecycle.
 *
 * `recoverable` is the entry state computed at determination time. Everything
 * after it is a human recording what happened: it was billed, the sub is
 * arguing, the money arrived, or it was given up on. Without these, the
 * "still recoverable" figure on the scorecard can only ever grow, and a
 * worklist that never shrinks stops being read.
 */
export const updateBackchargeSchema = z.object({
  status: z.enum(["recoverable", "issued", "disputed", "collected", "written_off"]),
  amountCents: z.number().int().min(0).nullable().optional(),
  note: z.string().max(1000).nullable().default(null),
});
export type UpdateBackchargeInput = z.infer<typeof updateBackchargeSchema>;

// ---------------------------------------------------------------------------
// generic API envelope
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;
