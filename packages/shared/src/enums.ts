/**
 * Domain vocabulary for Warranted.
 *
 * These are the words builders, subs, and warranty administrators actually use.
 * Keep them stable — they are persisted in the database and referenced by the
 * rules engine, the AI triage prompt, and both client apps.
 */

/** Who is using the system, and what they're allowed to see. */
export const ROLES = [
  "builder_admin", // owns the builder org; billing, users, settings
  "warranty_coordinator", // the person this product is designed to replace-proof
  "superintendent", // field staff; sees their communities only
  "homeowner", // sees only homes they own or have owned
] as const;
export type Role = (typeof ROLES)[number];

export const BUILDER_ROLES = [
  "builder_admin",
  "warranty_coordinator",
  "superintendent",
] as const satisfies readonly Role[];

/**
 * The 1-2-10 structure. Nearly every US production and regional builder uses
 * some version of this, whether self-administered or backed by a third party
 * (2-10 HBW, PWSC, RWC, StrucSure).
 */
export const WARRANTY_TIERS = [
  "workmanship", // 1 yr  — cosmetic, finish, installation quality
  "systems", // 2 yr  — plumbing, electrical, HVAC, mechanical distribution
  "structural", // 10 yr — major load-bearing failure only
] as const;
export type WarrantyTier = (typeof WARRANTY_TIERS)[number];

/** Default tier durations in months. Overridable per builder — some warrant 2-5-10. */
export const DEFAULT_TIER_MONTHS: Record<WarrantyTier, number> = {
  workmanship: 12,
  systems: 24,
  structural: 120,
};

/**
 * Trades, as they appear on a schedule of values and a sub contract.
 * The AI tags claims with one of these so work routes to the right sub.
 */
export const TRADES = [
  "concrete",
  "framing",
  "roofing",
  "plumbing",
  "electrical",
  "hvac",
  "insulation",
  "drywall",
  "paint",
  "trim_carpentry",
  "cabinets",
  "countertops",
  "flooring",
  "tile",
  "windows_doors",
  "siding_stucco",
  "gutters",
  "garage_door",
  "landscape_grading",
  "appliances", // usually manufacturer passthrough, not builder warranty
  "low_voltage",
  "other",
] as const;
export type Trade = (typeof TRADES)[number];

/** Which tier a trade's defects normally fall under, absent a specific clause. */
export const TRADE_DEFAULT_TIER: Record<Trade, WarrantyTier> = {
  concrete: "structural",
  framing: "structural",
  roofing: "workmanship",
  plumbing: "systems",
  electrical: "systems",
  hvac: "systems",
  insulation: "workmanship",
  drywall: "workmanship",
  paint: "workmanship",
  trim_carpentry: "workmanship",
  cabinets: "workmanship",
  countertops: "workmanship",
  flooring: "workmanship",
  tile: "workmanship",
  windows_doors: "workmanship",
  siding_stucco: "workmanship",
  gutters: "workmanship",
  garage_door: "workmanship",
  landscape_grading: "workmanship",
  appliances: "workmanship",
  low_voltage: "workmanship",
  other: "workmanship",
};

/** Lifecycle of a warranty service request. */
export const CLAIM_STATUSES = [
  "submitted", // homeowner filed it
  "triaged", // AI has assessed; awaiting coordinator
  "under_review", // coordinator looking at it
  "approved", // covered — work to be scheduled
  "scheduled", // appointment set with a sub
  "in_progress", // sub on site
  "completed", // work done, awaiting homeowner confirmation
  "verified", // homeowner confirmed resolved
  "denied", // not covered — reason recorded
  "referred", // routed elsewhere (manufacturer, insurer, homeowner maintenance)
  "withdrawn", // homeowner cancelled
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Terminal states — no further action expected. */
export const CLOSED_CLAIM_STATUSES = [
  "verified",
  "denied",
  "referred",
  "withdrawn",
] as const satisfies readonly ClaimStatus[];

/**
 * Severity drives SLA. Emergencies are carved out of every builder warranty
 * with a 24/7 response obligation, and getting this wrong is how builders end
 * up with water damage claims that dwarf the original defect.
 */
export const SEVERITIES = [
  "emergency", // no heat/AC in extreme weather, active leak, sewage, no power, gas
  "urgent", // habitability affected but not dangerous
  "routine", // normal service request
  "cosmetic", // finish-level, typically batched to the next scheduled visit
] as const;
export type Severity = (typeof SEVERITIES)[number];

/** What a coordinator concluded. Drives who pays. */
export const DETERMINATION_OUTCOMES = [
  "covered", // builder warranty pays; may be backcharged to a sub
  "not_covered_excluded", // explicitly excluded by the warranty terms
  "not_covered_expired", // real defect, but the tier's clock ran out
  "not_covered_tolerance", // within published performance tolerance — not a defect
  "homeowner_maintenance", // filters, caulk, grout, grading, landscape watering
  "manufacturer_warranty", // appliance or equipment — routed to the manufacturer
  "insurance_claim", // homeowner's policy (storm, impact, accidental damage)
  "goodwill", // not covered, but the builder is doing it anyway
] as const;
export type DeterminationOutcome = (typeof DETERMINATION_OUTCOMES)[number];

/** Outcomes where the builder performs work at its own cost. */
export const BUILDER_PAYS_OUTCOMES = [
  "covered",
  "goodwill",
] as const satisfies readonly DeterminationOutcome[];

/**
 * The three homeowner touchpoints. The 11-month is the one that matters:
 * it is the last chance to file against the 1-year workmanship tier.
 */
export const MILESTONE_KINDS = [
  "orientation", // blue-tape walkthrough at or just before closing
  "thirty_day", // early settling and punch items
  "eleven_month", // the deadline nobody remembers
] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_OFFSET_DAYS: Record<MilestoneKind, number> = {
  orientation: 0,
  thirty_day: 30,
  eleven_month: 334, // ~11 months, leaves ~31 days of runway before expiry
};

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  orientation: "Move-in orientation",
  thirty_day: "30-day check-in",
  eleven_month: "11-month warranty review",
};

export const MILESTONE_STATUSES = [
  "pending",
  "scheduled",
  "completed",
  "missed",
  "waived",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/**
 * Which date starts the warranty clock. Closing, CO, and possession routinely
 * differ, and warranty documents are inconsistent about which one governs.
 * This is stored explicitly per home rather than derived — it is the single
 * most common source of "is this still covered" disputes.
 */
export const WARRANTY_START_SOURCES = [
  "closing_date",
  "certificate_of_occupancy",
  "possession_date",
  "first_occupancy",
  "manual_override",
] as const;
export type WarrantyStartSource = (typeof WARRANTY_START_SOURCES)[number];

/** Recoverability of a claim's cost from the responsible subcontractor. */
export const BACKCHARGE_STATUSES = [
  "recoverable", // sub warranty still open — bill it
  "expired", // sub warranty closed before the claim — builder eats it
  "no_sub_assigned", // we don't know who did the work (the bus-factor failure)
  "disputed",
  "issued",
  "collected",
  "written_off",
] as const;
export type BackchargeStatus = (typeof BACKCHARGE_STATUSES)[number];
