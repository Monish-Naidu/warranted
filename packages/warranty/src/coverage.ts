/**
 * Coverage resolution: given a home's warranty start date and a claim date,
 * what is still in force, and under which tier?
 */

import {
  DEFAULT_TIER_MONTHS,
  TRADE_DEFAULT_TIER,
  type Trade,
  type WarrantyTier,
} from "@warranted/shared";
import { addMonths, daysBetween, isAfter, type IsoDate } from "./dates";

export interface TierWindow {
  tier: WarrantyTier;
  startDate: IsoDate;
  /** Inclusive last day of coverage. */
  endDate: IsoDate;
  months: number;
}

export interface TierCoverage extends TierWindow {
  active: boolean;
  daysRemaining: number;
  /** True inside the last 60 days — the window where action is still possible. */
  expiringSoon: boolean;
}

const EXPIRING_SOON_DAYS = 60;

/** Per-builder overrides, e.g. a 2-5-10 program. */
export type TierMonthsOverride = Partial<Record<WarrantyTier, number>>;

export function resolveTierMonths(
  override?: TierMonthsOverride,
): Record<WarrantyTier, number> {
  return { ...DEFAULT_TIER_MONTHS, ...override };
}

export function tierWindows(
  warrantyStartDate: IsoDate,
  override?: TierMonthsOverride,
): TierWindow[] {
  const months = resolveTierMonths(override);
  return (Object.keys(months) as WarrantyTier[]).map((tier) => {
    const m = months[tier];
    return {
      tier,
      months: m,
      startDate: warrantyStartDate,
      // Coverage runs through the day before the anniversary.
      endDate: addMonths(warrantyStartDate, m),
    };
  });
}

export function tierCoverage(
  warrantyStartDate: IsoDate,
  asOf: IsoDate,
  override?: TierMonthsOverride,
): TierCoverage[] {
  return tierWindows(warrantyStartDate, override).map((w) => {
    const daysRemaining = daysBetween(asOf, w.endDate);
    const active = daysRemaining >= 0 && !isAfter(w.startDate, asOf);
    return {
      ...w,
      active,
      daysRemaining,
      expiringSoon: active && daysRemaining <= EXPIRING_SOON_DAYS,
    };
  });
}

export interface CoverageVerdict {
  tier: WarrantyTier;
  covered: boolean;
  daysRemaining: number;
  endDate: IsoDate;
  reason: string;
}

/**
 * Is a defect of this trade still within its warranty window?
 *
 * This answers the *timing* question only. Whether the condition is a defect at
 * all is a tolerance question (`tolerances.ts`), and whether it is excluded is a
 * terms question read from the builder's own warranty document. All three have
 * to pass before a claim is covered — this function is deliberately not the
 * whole answer.
 */
export function checkCoverage(
  params: {
    trade: Trade;
    warrantyStartDate: IsoDate;
    claimDate: IsoDate;
    /** Set when a warranty clause assigns this condition to a specific tier. */
    tierOverride?: WarrantyTier;
    tierMonths?: TierMonthsOverride;
  },
): CoverageVerdict {
  const tier = params.tierOverride ?? TRADE_DEFAULT_TIER[params.trade];
  const coverage = tierCoverage(
    params.warrantyStartDate,
    params.claimDate,
    params.tierMonths,
  ).find((c) => c.tier === tier);

  if (!coverage) {
    throw new Error(`no coverage window resolved for tier ${tier}`);
  }

  const covered = coverage.active;
  const reason = covered
    ? `${tier} coverage runs through ${coverage.endDate} (${coverage.daysRemaining} days remaining).`
    : `${tier} coverage ended ${coverage.endDate}, ${Math.abs(coverage.daysRemaining)} days before this claim.`;

  return {
    tier,
    covered,
    daysRemaining: coverage.daysRemaining,
    endDate: coverage.endDate,
    reason,
  };
}

/**
 * The date after which no new claim of any kind can be filed — i.e. the end of
 * the longest active tier. Useful for the homeowner-facing countdown.
 */
export function finalCoverageDate(
  warrantyStartDate: IsoDate,
  override?: TierMonthsOverride,
): IsoDate {
  const windows = tierWindows(warrantyStartDate, override);
  return windows.reduce((latest, w) =>
    isAfter(w.endDate, latest.endDate) ? w : latest,
  ).endDate;
}
