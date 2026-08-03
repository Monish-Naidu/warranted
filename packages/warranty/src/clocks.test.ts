import { describe, expect, it } from "vitest";
import { addMonths, daysBetween } from "./dates";
import { checkCoverage, finalCoverageDate, tierCoverage } from "./coverage";
import {
  analyzeExposure,
  backchargeRecoverability,
  exposureAlerts,
  milestoneSchedule,
  type SubAssignmentInput,
} from "./clocks";

describe("date math", () => {
  it("clamps month arithmetic to the end of short months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("does not drift across a timezone boundary", () => {
    // The bug this guards: new Date("2026-03-14") in US time is the 13th.
    expect(addMonths("2026-03-14", 12)).toBe("2027-03-14");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("tier coverage", () => {
  const START = "2026-03-01";

  it("builds 1-2-10 windows from the warranty start date", () => {
    const windows = tierCoverage(START, START);
    expect(windows.find((w) => w.tier === "workmanship")?.endDate).toBe("2027-03-01");
    expect(windows.find((w) => w.tier === "systems")?.endDate).toBe("2028-03-01");
    expect(windows.find((w) => w.tier === "structural")?.endDate).toBe("2036-03-01");
  });

  it("covers drywall at 11 months and not at 13", () => {
    expect(
      checkCoverage({ trade: "drywall", warrantyStartDate: START, claimDate: "2027-02-01" })
        .covered,
    ).toBe(true);
    expect(
      checkCoverage({ trade: "drywall", warrantyStartDate: START, claimDate: "2027-04-01" })
        .covered,
    ).toBe(false);
  });

  it("keeps plumbing covered into year two, unlike drywall", () => {
    const claimDate = "2027-09-01"; // 18 months in
    expect(
      checkCoverage({ trade: "plumbing", warrantyStartDate: START, claimDate }).covered,
    ).toBe(true);
    expect(
      checkCoverage({ trade: "drywall", warrantyStartDate: START, claimDate }).covered,
    ).toBe(false);
  });

  it("treats the final day of a window as covered", () => {
    const verdict = checkCoverage({
      trade: "drywall",
      warrantyStartDate: START,
      claimDate: "2027-03-01",
    });
    expect(verdict.covered).toBe(true);
    expect(verdict.daysRemaining).toBe(0);
  });

  it("honors a builder's 2-5-10 program", () => {
    const verdict = checkCoverage({
      trade: "drywall",
      warrantyStartDate: START,
      claimDate: "2027-09-01",
      tierMonths: { workmanship: 24 },
    });
    expect(verdict.covered).toBe(true);
  });

  it("reports the structural tier as the last date any claim can be filed", () => {
    expect(finalCoverageDate(START)).toBe("2036-03-01");
  });
});

describe("milestones", () => {
  it("puts the 11-month review inside the workmanship window, with runway", () => {
    const schedule = milestoneSchedule("2026-03-01", "2026-03-01");
    const elevenMonth = schedule.find((m) => m.kind === "eleven_month");

    expect(elevenMonth?.dueDate).toBe("2027-01-29");
    expect(elevenMonth?.isLastChance).toBe(true);
    // Must land before workmanship expires, or the whole point is lost.
    expect(daysBetween(elevenMonth!.dueDate, "2027-03-01")).toBeGreaterThan(30);
  });

  it("flags an overdue milestone", () => {
    const schedule = milestoneSchedule("2026-03-01", "2027-06-01");
    expect(schedule.every((m) => m.overdue)).toBe(true);
  });
});

describe("the two clocks", () => {
  // A spec home: drywall finished in March, house didn't close until September.
  const WARRANTY_START = "2026-09-15"; // closing
  const assignments: SubAssignmentInput[] = [
    {
      id: "a1",
      subcontractorId: "s1",
      subcontractorName: "Valley Drywall",
      trade: "drywall",
      completedAt: "2026-03-10", // six months before closing
      subWarrantyStart: null,
      subWarrantyMonths: 12,
    },
    {
      id: "a2",
      subcontractorId: "s2",
      subcontractorName: "Copper State Plumbing",
      trade: "plumbing",
      completedAt: "2026-02-01",
      subWarrantyStart: null,
      subWarrantyMonths: 24,
    },
    {
      id: "a3",
      subcontractorId: "s3",
      subcontractorName: "Unknown Framing LLC",
      trade: "framing",
      completedAt: null, // the bus-factor case
      subWarrantyStart: null,
      subWarrantyMonths: 12,
    },
  ];

  it("finds the uncovered tail on a spec home", () => {
    const exposure = analyzeExposure({
      warrantyStartDate: WARRANTY_START,
      assignments,
      asOf: "2026-09-15",
    });

    const drywall = exposure.find((e) => e.trade === "drywall")!;
    // Sub warranty ends 2027-03-10; homeowner's runs to 2027-09-15.
    expect(drywall.subCoverageEnd).toBe("2027-03-10");
    expect(drywall.builderCoverageEnd).toBe("2027-09-15");
    expect(drywall.exposureStart).toBe("2027-03-11");
    // Just over six months where the builder carries drywall alone.
    expect(drywall.exposureDays).toBe(188);
  });

  it("reports no exposure when the sub warranty outlasts the builder's", () => {
    const exposure = analyzeExposure({
      warrantyStartDate: WARRANTY_START,
      assignments,
      asOf: "2026-09-15",
    });
    const plumbing = exposure.find((e) => e.trade === "plumbing")!;
    // 24-month sub warranty from Feb 2026 runs to Feb 2028, past the
    // systems tier ending Sep 2028? No — systems ends 2028-09-15.
    expect(plumbing.subCoverageEnd).toBe("2028-02-01");
    expect(plumbing.exposureDays).toBeGreaterThan(0);
  });

  it("treats a missing completion date as full exposure, not missing data", () => {
    const exposure = analyzeExposure({
      warrantyStartDate: WARRANTY_START,
      assignments,
      asOf: "2026-09-15",
    });
    const framing = exposure.find((e) => e.trade === "framing")!;
    expect(framing.unknown).toBe(true);
    expect(framing.exposureStart).toBe(WARRANTY_START);
    // Framing is structural — ten years with no provable backcharge path.
    expect(framing.exposureDays).toBeGreaterThan(3600);
  });

  it("escalates to critical when the 11-month review is unscheduled", () => {
    const exposure = analyzeExposure({
      warrantyStartDate: WARRANTY_START,
      assignments,
      asOf: "2027-02-10", // ~28 days before the drywall sub lapses
    });

    const unscheduled = exposureAlerts({
      exposure,
      elevenMonthScheduled: false,
      lotLabel: "Lot 42",
    });
    const drywallAlert = unscheduled.find((a) => a.trade === "drywall");
    expect(drywallAlert?.severity).toBe("critical");
    expect(drywallAlert?.message).toContain("not yet scheduled");

    const scheduled = exposureAlerts({
      exposure,
      elevenMonthScheduled: true,
      lotLabel: "Lot 42",
    });
    expect(scheduled.find((a) => a.trade === "drywall")?.severity).toBe("warning");
  });
});

describe("backcharge recoverability", () => {
  const assignments: SubAssignmentInput[] = [
    {
      id: "a1",
      subcontractorId: "s1",
      subcontractorName: "Valley Drywall",
      trade: "drywall",
      completedAt: "2026-03-10",
      subWarrantyStart: null,
      subWarrantyMonths: 12,
    },
  ];

  it("bills back while the sub window is open", () => {
    const result = backchargeRecoverability({
      trade: "drywall",
      claimDate: "2027-01-15",
      assignments,
    });
    expect(result.status).toBe("recoverable");
  });

  it("reports days late once the sub window has closed", () => {
    const result = backchargeRecoverability({
      trade: "drywall",
      claimDate: "2027-06-01",
      assignments,
    });
    expect(result.status).toBe("expired");
    if (result.status === "expired") {
      expect(result.daysLate).toBe(83);
    }
  });

  it("distinguishes an undocumented sub from an expired one", () => {
    const result = backchargeRecoverability({
      trade: "roofing",
      claimDate: "2027-01-15",
      assignments,
    });
    expect(result.status).toBe("no_sub_assigned");
  });
});
