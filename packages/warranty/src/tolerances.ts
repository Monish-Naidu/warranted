/**
 * Construction performance tolerances — the table that decides whether an
 * observed condition is a *defect* or is *within acceptable tolerance*.
 *
 * This is what separates a defensible determination from an argument. Without
 * it, "there's a crack in my drywall" has no answer; with it, the answer is
 * "hairline cracks under 1/8" are expected first-year shrinkage and are
 * addressed once at the 11-month visit."
 *
 * ---------------------------------------------------------------------------
 * ⚠️  LICENSING
 *
 * The NAHB *Residential Construction Performance Guidelines* is the industry
 * standard here and is COPYRIGHTED. The values below are widely-cited
 * approximations used as a STRUCTURAL PLACEHOLDER so the engine and the AI
 * prompt have something real to reason against during development.
 *
 * Before relying on this commercially you must either license the NAHB
 * guidelines, adopt your builder's own published performance standard, or use
 * an applicable state standard. Replace `TOLERANCES` wholesale — every
 * consumer of this module reads it through `findTolerance()`, so swapping the
 * data does not require touching call sites.
 * ---------------------------------------------------------------------------
 */

import type { Trade } from "@warranted/shared";

export interface Tolerance {
  /** Stable key, referenced by AI citations and stored on assessments. */
  id: string;
  trade: Trade;
  /** Plain-language condition a homeowner would describe. */
  condition: string;
  /** The threshold at which it becomes actionable. */
  threshold: string;
  /** Machine-comparable form, when the condition is dimensional. */
  measurement: {
    unit: "inch" | "degree" | "count" | "percent";
    /** Defect when the measured value exceeds this. */
    maxAcceptable: number;
    /** Span the measurement is taken over, e.g. "32 inches". */
    over?: string;
  } | null;
  /** Which warranty year this is normally observed and corrected in. */
  typicalWindowMonths: number;
  notes: string;
}

export const TOLERANCES: readonly Tolerance[] = [
  {
    id: "drywall.crack",
    trade: "drywall",
    condition: "Cracks in drywall walls or ceilings",
    threshold: 'Wider than 1/8"',
    measurement: { unit: "inch", maxAcceptable: 0.125 },
    typicalWindowMonths: 12,
    notes:
      "Hairline cracks from lumber shrinkage are expected in year one. Standard practice is a single repair at the 11-month visit rather than repeated trips.",
  },
  {
    id: "drywall.nail_pops",
    trade: "drywall",
    condition: "Nail or screw pops",
    threshold: "Visible under normal lighting after year one",
    measurement: null,
    typicalWindowMonths: 12,
    notes: "Normal framing shrinkage. Batched to the 11-month repair visit.",
  },
  {
    id: "concrete.slab_crack",
    trade: "concrete",
    condition: "Cracks in a concrete slab or foundation",
    threshold: 'Wider than 1/4", or with vertical displacement',
    measurement: { unit: "inch", maxAcceptable: 0.25 },
    typicalWindowMonths: 120,
    notes:
      "Shrinkage cracking is inherent to concrete. Displacement or progressive widening suggests a structural issue and should escalate immediately.",
  },
  {
    id: "concrete.flatwork_crack",
    trade: "concrete",
    condition: "Cracks in driveways, walks, or patios",
    threshold: 'Wider than 1/4" or displaced more than 1/4"',
    measurement: { unit: "inch", maxAcceptable: 0.25 },
    typicalWindowMonths: 12,
    notes: "Control joints are intended to crack. Cracks at joints are not defects.",
  },
  {
    id: "framing.floor_level",
    trade: "framing",
    condition: "Floor out of level",
    threshold: 'More than 3/8" over 32 inches',
    measurement: { unit: "inch", maxAcceptable: 0.375, over: "32 inches" },
    typicalWindowMonths: 12,
    notes: "Measured excluding the perimeter within 6 inches of a wall.",
  },
  {
    id: "framing.wall_plumb",
    trade: "framing",
    condition: "Wall out of plumb",
    threshold: 'More than 1/4" over 32 vertical inches',
    measurement: { unit: "inch", maxAcceptable: 0.25, over: "32 vertical inches" },
    typicalWindowMonths: 12,
    notes: "",
  },
  {
    id: "tile.grout_crack",
    trade: "tile",
    condition: "Cracked or missing grout, or separated caulk",
    threshold: "Generally homeowner maintenance after the first year",
    measurement: null,
    typicalWindowMonths: 12,
    notes:
      "Grout and caulk are wear items in wet areas. Repeated failure in the same location may indicate movement or a substrate defect and should be inspected rather than re-caulked.",
  },
  {
    id: "flooring.hardwood_gap",
    trade: "flooring",
    condition: "Gaps between hardwood floor boards",
    threshold: 'Wider than 1/8" at normal indoor humidity',
    measurement: { unit: "inch", maxAcceptable: 0.125 },
    typicalWindowMonths: 12,
    notes:
      "Seasonal movement is expected. Evaluate during the humid season, not mid-winter with the heat running.",
  },
  {
    id: "windows_doors.door_bind",
    trade: "windows_doors",
    condition: "Doors binding, sticking, or not latching",
    threshold: "Any failure to operate",
    measurement: null,
    typicalWindowMonths: 12,
    notes: "Usually a one-time adjustment as framing settles.",
  },
  {
    id: "windows_doors.water_infiltration",
    trade: "windows_doors",
    condition: "Water entering around a window or door",
    threshold: "Any infiltration is a defect",
    measurement: null,
    typicalWindowMonths: 12,
    notes: "No tolerance. Escalate — consequential damage compounds quickly.",
  },
  {
    id: "roofing.leak",
    trade: "roofing",
    condition: "Roof leak",
    threshold: "Any leak is a defect",
    measurement: null,
    typicalWindowMonths: 12,
    notes: "Emergency if active. Storm damage is typically an insurance claim, not warranty.",
  },
  {
    id: "plumbing.leak",
    trade: "plumbing",
    condition: "Leak in supply or drain piping",
    threshold: "Any leak is a defect",
    measurement: null,
    typicalWindowMonths: 24,
    notes: "Emergency. Systems tier — covered for two years in a standard 1-2-10.",
  },
  {
    id: "hvac.temperature_differential",
    trade: "hvac",
    condition: "Room fails to reach set temperature",
    threshold:
      "Unable to maintain 70°F heating / 78°F cooling at design conditions, or more than 4°F room-to-room variance",
    measurement: { unit: "degree", maxAcceptable: 4 },
    typicalWindowMonths: 24,
    notes:
      "Verify filter condition and register balancing first — a clogged filter is homeowner maintenance, not a warranty defect.",
  },
  {
    id: "electrical.outlet_dead",
    trade: "electrical",
    condition: "Outlet, switch, or fixture not functioning",
    threshold: "Any non-functioning device",
    measurement: null,
    typicalWindowMonths: 24,
    notes: "Check GFCI/AFCI reset before dispatching a sub.",
  },
  {
    id: "paint.touchup",
    trade: "paint",
    condition: "Paint touch-up, sheen variation, or minor blemishes",
    threshold: "Visible from 6 feet in natural light",
    measurement: null,
    typicalWindowMonths: 12,
    notes:
      "Touch-ups are not expected to match perfectly; repainting a full wall is not standard remedy for a spot repair.",
  },
  {
    id: "landscape_grading.drainage",
    trade: "landscape_grading",
    condition: "Standing water or negative drainage toward the foundation",
    threshold: "Water standing more than 24 hours after rainfall",
    measurement: null,
    typicalWindowMonths: 12,
    notes:
      "Excluded once the homeowner alters grade, adds landscaping or hardscape, or installs a pool — document the original grade at closing.",
  },
  {
    id: "siding_stucco.stucco_crack",
    trade: "siding_stucco",
    condition: "Cracks in stucco",
    threshold: 'Wider than 1/8"',
    measurement: { unit: "inch", maxAcceptable: 0.125 },
    typicalWindowMonths: 12,
    notes: "Hairline cracking is inherent to cementitious finishes.",
  },
  {
    id: "cabinets.door_alignment",
    trade: "cabinets",
    condition: "Cabinet doors or drawers misaligned",
    threshold: 'Gaps varying more than 1/8" across a run',
    measurement: { unit: "inch", maxAcceptable: 0.125 },
    typicalWindowMonths: 12,
    notes: "Typically a hinge adjustment.",
  },
  {
    id: "countertops.seam",
    trade: "countertops",
    condition: "Visible seam or lippage in a countertop",
    threshold: 'Lippage greater than 1/32"',
    measurement: { unit: "inch", maxAcceptable: 0.03125 },
    typicalWindowMonths: 12,
    notes: "Seams in stone are expected to be visible; they should be flush and filled.",
  },
];

/** Conditions with no tolerance — any occurrence is a defect and escalates. */
export const ZERO_TOLERANCE_IDS: readonly string[] = [
  "windows_doors.water_infiltration",
  "roofing.leak",
  "plumbing.leak",
  "electrical.outlet_dead",
];

export function findTolerance(id: string): Tolerance | null {
  return TOLERANCES.find((t) => t.id === id) ?? null;
}

export function tolerancesForTrade(trade: Trade): Tolerance[] {
  return TOLERANCES.filter((t) => t.trade === trade);
}

/**
 * Compare a measurement against a tolerance.
 * Returns `null` when the tolerance isn't dimensional and needs human judgment.
 */
export function isWithinTolerance(
  toleranceId: string,
  measuredValue: number,
): boolean | null {
  const tolerance = findTolerance(toleranceId);
  if (!tolerance?.measurement) return null;
  return measuredValue <= tolerance.measurement.maxAcceptable;
}

/** Compact form injected into the AI triage prompt. */
export function tolerancesAsPromptContext(): string {
  return TOLERANCES.map((t) => {
    const zero = ZERO_TOLERANCE_IDS.includes(t.id) ? " [ZERO TOLERANCE]" : "";
    return `- ${t.id} (${t.trade})${zero}: ${t.condition} — defect when ${t.threshold}.${
      t.notes ? ` Note: ${t.notes}` : ""
    }`;
  }).join("\n");
}
