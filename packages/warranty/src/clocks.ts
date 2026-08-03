/**
 * The two clocks.
 *
 * A builder warrants workmanship to the homeowner for 12 months **from
 * closing**. Its subcontractors warrant the same work to the builder for 12
 * months **from their own completion** — which on a spec home or a slow phase
 * can be six or nine months earlier.
 *
 * The overlap is protected. The tail is not: any claim landing after the sub's
 * window closes but inside the homeowner's is cash out of the builder's pocket
 * for work someone else owes.
 *
 *   sub completes                sub warranty ends
 *        |----------------------------|
 *                     |------------------------------------|
 *                  closing                       homeowner warranty ends
 *                                  |^^^^^^^^^^^^^^^^^^^^^^^^|
 *                                        EXPOSURE WINDOW
 *
 * This module computes that window. It is the reason the product exists.
 */

import {
  MILESTONE_LABELS,
  MILESTONE_OFFSET_DAYS,
  MILESTONE_KINDS,
  TRADE_DEFAULT_TIER,
  type MilestoneKind,
  type Trade,
} from "@warranted/shared";
import {
  addDays,
  addMonths,
  daysBetween,
  isAfter,
  isBefore,
  isWithin,
  maxDate,
  type IsoDate,
} from "./dates";
import { tierWindows, type TierMonthsOverride } from "./coverage";

// ---------------------------------------------------------------------------
// homeowner milestones
// ---------------------------------------------------------------------------

export interface ScheduledMilestone {
  kind: MilestoneKind;
  label: string;
  dueDate: IsoDate;
  /** Days until due; negative once overdue. */
  daysUntilDue: number;
  overdue: boolean;
  /**
   * True for the 11-month review, which is the last practical chance to file
   * against the workmanship tier. Missing it forfeits the largest bucket.
   */
  isLastChance: boolean;
}

export function milestoneSchedule(
  warrantyStartDate: IsoDate,
  asOf: IsoDate,
): ScheduledMilestone[] {
  return MILESTONE_KINDS.map((kind) => {
    const dueDate = addDays(warrantyStartDate, MILESTONE_OFFSET_DAYS[kind]);
    const daysUntilDue = daysBetween(asOf, dueDate);
    return {
      kind,
      label: MILESTONE_LABELS[kind],
      dueDate,
      daysUntilDue,
      overdue: daysUntilDue < 0,
      isLastChance: kind === "eleven_month",
    };
  });
}

// ---------------------------------------------------------------------------
// subcontractor clock
// ---------------------------------------------------------------------------

export interface SubAssignmentInput {
  id: string;
  subcontractorId: string;
  subcontractorName: string;
  trade: Trade;
  /** When the sub finished this scope. Starts their clock. */
  completedAt: IsoDate | null;
  /** Explicit override when the contract says otherwise. */
  subWarrantyStart: IsoDate | null;
  subWarrantyMonths: number;
}

export interface SubWindow {
  assignmentId: string;
  subcontractorId: string;
  subcontractorName: string;
  trade: Trade;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  /** Sub clock could not be established — usually a missing completion date. */
  unknown: boolean;
}

export function subWindow(assignment: SubAssignmentInput): SubWindow {
  const start = assignment.subWarrantyStart ?? assignment.completedAt;
  return {
    assignmentId: assignment.id,
    subcontractorId: assignment.subcontractorId,
    subcontractorName: assignment.subcontractorName,
    trade: assignment.trade,
    startDate: start,
    endDate: start ? addMonths(start, assignment.subWarrantyMonths) : null,
    unknown: start === null,
  };
}

export interface ExposureWindow {
  assignmentId: string;
  subcontractorId: string;
  subcontractorName: string;
  trade: Trade;
  /** The homeowner-facing tier this trade falls under. */
  builderCoverageEnd: IsoDate;
  subCoverageEnd: IsoDate | null;
  /** First day the builder is exposed. Null when the sub outlasts the builder. */
  exposureStart: IsoDate | null;
  exposureEnd: IsoDate | null;
  /** Days the builder carries this trade alone. 0 when fully back-to-back. */
  exposureDays: number;
  /** True when `asOf` falls inside the exposure window right now. */
  currentlyExposed: boolean;
  /** Sub warranty still open, but closing within the alert threshold. */
  closingSoon: boolean;
  daysUntilSubExpiry: number | null;
  unknown: boolean;
}

const SUB_EXPIRY_ALERT_DAYS = 45;

/**
 * Compute the builder's uncovered tail for each trade on a home.
 *
 * `unknown: true` — no completion date on record — is not a benign gap. It is
 * the bus-factor failure: the builder cannot prove who did the work, so it
 * cannot backcharge at all. Treat it as exposure, not as missing data.
 */
export function analyzeExposure(params: {
  warrantyStartDate: IsoDate;
  assignments: SubAssignmentInput[];
  asOf: IsoDate;
  tierMonths?: TierMonthsOverride;
}): ExposureWindow[] {
  const windows = tierWindows(params.warrantyStartDate, params.tierMonths);
  const tierEnd = (trade: Trade): IsoDate => {
    const tier = TRADE_DEFAULT_TIER[trade];
    const w = windows.find((x) => x.tier === tier);
    if (!w) throw new Error(`no window for tier ${tier}`);
    return w.endDate;
  };

  return params.assignments.map((assignment) => {
    const sub = subWindow(assignment);
    const builderCoverageEnd = tierEnd(assignment.trade);

    if (sub.unknown || sub.endDate === null) {
      return {
        assignmentId: sub.assignmentId,
        subcontractorId: sub.subcontractorId,
        subcontractorName: sub.subcontractorName,
        trade: sub.trade,
        builderCoverageEnd,
        subCoverageEnd: null,
        // No provable sub coverage means the whole builder window is exposed.
        exposureStart: params.warrantyStartDate,
        exposureEnd: builderCoverageEnd,
        exposureDays: Math.max(
          0,
          daysBetween(params.warrantyStartDate, builderCoverageEnd),
        ),
        currentlyExposed: !isAfter(params.asOf, builderCoverageEnd),
        closingSoon: false,
        daysUntilSubExpiry: null,
        unknown: true,
      };
    }

    const subEnd = sub.endDate;
    const fullyCovered = !isBefore(subEnd, builderCoverageEnd);
    // Exposure begins the day after the sub's warranty lapses, but never
    // before the homeowner's clock starts.
    const rawExposureStart = addDays(subEnd, 1);
    const exposureStart = fullyCovered
      ? null
      : (maxDate(rawExposureStart, params.warrantyStartDate) ?? rawExposureStart);
    const exposureEnd = fullyCovered ? null : builderCoverageEnd;
    const exposureDays =
      exposureStart && exposureEnd
        ? Math.max(0, daysBetween(exposureStart, exposureEnd))
        : 0;
    const daysUntilSubExpiry = daysBetween(params.asOf, subEnd);

    return {
      assignmentId: sub.assignmentId,
      subcontractorId: sub.subcontractorId,
      subcontractorName: sub.subcontractorName,
      trade: sub.trade,
      builderCoverageEnd,
      subCoverageEnd: subEnd,
      exposureStart,
      exposureEnd,
      exposureDays,
      currentlyExposed:
        exposureStart !== null &&
        exposureEnd !== null &&
        isWithin(params.asOf, exposureStart, exposureEnd),
      closingSoon:
        daysUntilSubExpiry >= 0 && daysUntilSubExpiry <= SUB_EXPIRY_ALERT_DAYS,
      daysUntilSubExpiry,
      unknown: false,
    };
  });
}

/**
 * The alert this product is built to send.
 *
 * A sub warranty about to lapse only matters when the homeowner's clock keeps
 * running afterward — that is precisely the window in which an unfound defect
 * converts into an unrecoverable cost. Surfacing it while the 11-month review
 * is still unscheduled is the difference between a backcharge and a write-off.
 */
export interface ExposureAlert {
  severity: "critical" | "warning";
  trade: Trade;
  subcontractorName: string;
  assignmentId: string;
  message: string;
  daysUntilSubExpiry: number | null;
  exposureDays: number;
}

export function exposureAlerts(params: {
  exposure: ExposureWindow[];
  /** Pass false when the 11-month review is still unscheduled — raises severity. */
  elevenMonthScheduled: boolean;
  lotLabel: string;
}): ExposureAlert[] {
  const alerts: ExposureAlert[] = [];

  for (const e of params.exposure) {
    if (e.unknown) {
      alerts.push({
        severity: "critical",
        trade: e.trade,
        subcontractorName: e.subcontractorName,
        assignmentId: e.assignmentId,
        message: `${params.lotLabel}: no completion date on record for ${e.trade}. Warranty work on this trade cannot be backcharged — the full ${e.exposureDays}-day builder window is unrecoverable.`,
        daysUntilSubExpiry: null,
        exposureDays: e.exposureDays,
      });
      continue;
    }

    if (e.closingSoon && e.exposureDays > 0) {
      alerts.push({
        severity: params.elevenMonthScheduled ? "warning" : "critical",
        trade: e.trade,
        subcontractorName: e.subcontractorName,
        assignmentId: e.assignmentId,
        message:
          `${params.lotLabel}: ${e.subcontractorName} (${e.trade}) warranty expires in ${e.daysUntilSubExpiry} days, ` +
          `leaving ${e.exposureDays} days where you carry this trade alone` +
          (params.elevenMonthScheduled
            ? "."
            : " — and the 11-month review is not yet scheduled. Inspect before the sub clock closes."),
        daysUntilSubExpiry: e.daysUntilSubExpiry,
        exposureDays: e.exposureDays,
      });
      continue;
    }

    if (e.currentlyExposed) {
      alerts.push({
        severity: "warning",
        trade: e.trade,
        subcontractorName: e.subcontractorName,
        assignmentId: e.assignmentId,
        message: `${params.lotLabel}: ${e.trade} sub warranty closed ${e.subCoverageEnd}. Claims through ${e.builderCoverageEnd} are on the builder.`,
        daysUntilSubExpiry: e.daysUntilSubExpiry,
        exposureDays: e.exposureDays,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// backcharge recoverability
// ---------------------------------------------------------------------------

export type Recoverability =
  | { status: "recoverable"; assignmentId: string; reason: string }
  | { status: "expired"; assignmentId: string; reason: string; daysLate: number }
  | { status: "no_sub_assigned"; reason: string };

/**
 * Can this claim's cost be billed back to the sub who did the work?
 *
 * Answering it at claim time — rather than at invoice time months later — is
 * what turns "we think we can charge this back" into a decision the coordinator
 * can act on while the sub's window is still open.
 */
export function backchargeRecoverability(params: {
  trade: Trade;
  claimDate: IsoDate;
  assignments: SubAssignmentInput[];
}): Recoverability {
  const match = params.assignments.find((a) => a.trade === params.trade);
  if (!match) {
    return {
      status: "no_sub_assigned",
      reason: `No subcontractor of record for ${params.trade} on this home. Cost is unrecoverable until the assignment is documented.`,
    };
  }

  const window = subWindow(match);
  if (window.unknown || window.endDate === null) {
    return {
      status: "no_sub_assigned",
      reason: `${window.subcontractorName} is assigned to ${params.trade}, but has no completion date — their warranty window can't be established.`,
    };
  }

  const daysLate = daysBetween(window.endDate, params.claimDate);
  if (daysLate > 0) {
    return {
      status: "expired",
      assignmentId: match.id,
      daysLate,
      reason: `${window.subcontractorName}'s warranty ended ${window.endDate}, ${daysLate} days before this claim was filed. Not recoverable.`,
    };
  }

  return {
    status: "recoverable",
    assignmentId: match.id,
    reason: `${window.subcontractorName}'s warranty runs through ${window.endDate}. Backcharge while it's open.`,
  };
}
