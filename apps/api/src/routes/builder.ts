import { zValidator } from "@hono/zod-validator";
import {
  createSubAssignmentSchema,
  updateBackchargeSchema,
} from "@warranted/shared";
import {
  analyzeExposure,
  exposureAlerts,
  milestoneSchedule,
  today,
  type ExposureAlert,
  type IsoDate,
  type SubAssignmentInput,
} from "@warranted/warranty";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  backcharges,
  claimEvents,
  claims,
  communities,
  determinations,
  homes,
  milestones,
  plans,
  subAssignments,
  subcontractors,
} from "../db/schema.js";
import { builderIdOf, requireAuth, requireBuilderStaff, type AppEnv } from "../middleware/auth.js";

export const builderRoutes = new Hono<AppEnv>();
builderRoutes.use("*", requireAuth, requireBuilderStaff);

/**
 * The alert board. This is the product's reason to exist.
 *
 * For every lot, it compares the homeowner's warranty clock against each
 * subcontractor's, and surfaces the window where the builder carries a trade
 * alone. Sorted so the money is at the top: closing-soonest first, then
 * largest uncovered exposure.
 */
builderRoutes.get("/exposure", async (c) => {
  const builderId = builderIdOf(c);
  const asOf = today();

  const homeRows = await db
    .select({ home: homes, community: communities, plan: plans })
    .from(homes)
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .leftJoin(plans, eq(homes.planId, plans.id))
    .where(eq(homes.builderId, builderId));

  if (homeRows.length === 0) {
    return c.json({ alerts: [], lots: [], summary: emptySummary() });
  }

  const homeIds = homeRows.map((r) => r.home.id);

  const [assignmentRows, milestoneRows] = await Promise.all([
    db
      .select({ assignment: subAssignments, sub: subcontractors })
      .from(subAssignments)
      .innerJoin(subcontractors, eq(subAssignments.subcontractorId, subcontractors.id))
      .where(inArray(subAssignments.homeId, homeIds)),
    db
      .select()
      .from(milestones)
      .where(
        and(inArray(milestones.homeId, homeIds), eq(milestones.kind, "eleven_month")),
      ),
  ]);

  const allAlerts: Array<ExposureAlert & { homeId: string; lotLabel: string }> = [];
  const lots = homeRows.map(({ home, community, plan }) => {
    const start = home.warrantyStartDate as IsoDate;
    const lotLabel = `Lot ${home.lotNumber} (${community.name})`;

    const assignments: SubAssignmentInput[] = assignmentRows
      .filter((a) => a.assignment.homeId === home.id)
      .map(({ assignment, sub }) => ({
        id: assignment.id,
        subcontractorId: assignment.subcontractorId,
        subcontractorName: sub.companyName,
        trade: assignment.trade,
        completedAt: assignment.completedAt as IsoDate | null,
        subWarrantyStart: assignment.subWarrantyStart as IsoDate | null,
        subWarrantyMonths: assignment.subWarrantyMonths,
      }));

    const exposure = analyzeExposure({
      warrantyStartDate: start,
      assignments,
      asOf,
    });

    const elevenMonth = milestoneRows.find((m) => m.homeId === home.id);
    const elevenMonthScheduled =
      elevenMonth?.status === "scheduled" || elevenMonth?.status === "completed";

    const alerts = exposureAlerts({ exposure, elevenMonthScheduled, lotLabel });
    allAlerts.push(...alerts.map((a) => ({ ...a, homeId: home.id, lotLabel })));

    return {
      homeId: home.id,
      lotNumber: home.lotNumber,
      address: home.addressLine1,
      community: community.name,
      plan: plan?.name ?? null,
      warrantyStartDate: start,
      /*
       * The start date travels with its provenance, always.
       *
       * Closing, certificate of occupancy, and possession routinely differ,
       * and warranty documents disagree about which one governs — which makes
       * this the most-disputed field in the domain. A coordinator defending a
       * coverage decision needs to see *which* date was used and why, not just
       * the answer. Sending the three candidate dates alongside it means the
       * portal can show the disagreement rather than hiding it.
       */
      warrantyStartSource: home.warrantyStartSource,
      warrantyStartNote: home.warrantyStartNote,
      closingDate: home.closingDate,
      certificateOfOccupancyDate: home.certificateOfOccupancyDate,
      possessionDate: home.possessionDate,
      elevenMonth: {
        dueDate: elevenMonth?.dueDate ?? null,
        status: elevenMonth?.status ?? "pending",
        scheduled: elevenMonthScheduled,
        daysUntilDue:
          milestoneSchedule(start, asOf).find((m) => m.kind === "eleven_month")
            ?.daysUntilDue ?? null,
      },
      exposure,
      totalExposureDays: exposure.reduce((sum, e) => sum + e.exposureDays, 0),
      undocumentedTrades: exposure.filter((e) => e.unknown).length,
    };
  });

  allAlerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    const aDays = a.daysUntilSubExpiry ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysUntilSubExpiry ?? Number.POSITIVE_INFINITY;
    if (aDays !== bDays) return aDays - bDays;
    return b.exposureDays - a.exposureDays;
  });

  return c.json({
    alerts: allAlerts,
    lots,
    summary: {
      lots: lots.length,
      criticalAlerts: allAlerts.filter((a) => a.severity === "critical").length,
      warningAlerts: allAlerts.filter((a) => a.severity === "warning").length,
      undocumentedAssignments: lots.reduce((s, l) => s + l.undocumentedTrades, 0),
      lotsWithUnscheduledElevenMonth: lots.filter(
        (l) => !l.elevenMonth.scheduled && (l.elevenMonth.daysUntilDue ?? 1) <= 60,
      ).length,
    },
  });
});

function emptySummary() {
  return {
    lots: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    undocumentedAssignments: 0,
    lotsWithUnscheduledElevenMonth: 0,
  };
}

/**
 * Record who did what on a lot, and when they finished.
 *
 * This is the write path that fixes the bus-factor problem. An assignment with
 * no `completedAt` is a trade the builder cannot backcharge, because it cannot
 * prove the sub's warranty window — so capturing the completion date is the
 * single highest-value piece of data entry in the product.
 */
builderRoutes.post(
  "/homes/:homeId/assignments",
  zValidator("json", createSubAssignmentSchema.omit({ homeId: true })),
  async (c) => {
    const builderId = builderIdOf(c);
    const homeId = c.req.param("homeId");
    const input = c.req.valid("json");

    const [home] = await db
      .select({ id: homes.id })
      .from(homes)
      .where(and(eq(homes.id, homeId), eq(homes.builderId, builderId)))
      .limit(1);
    if (!home) {
      return c.json({ error: { code: "not_found", message: "No such home." } }, 404);
    }

    // Scope the subcontractor to this builder too, or one tenant could attach
    // another's subs to its lots by guessing an id.
    const [sub] = await db
      .select({ id: subcontractors.id, months: subcontractors.defaultWarrantyMonths })
      .from(subcontractors)
      .where(
        and(
          eq(subcontractors.id, input.subcontractorId),
          eq(subcontractors.builderId, builderId),
        ),
      )
      .limit(1);
    if (!sub) {
      return c.json(
        { error: { code: "not_found", message: "No such subcontractor." } },
        404,
      );
    }

    const [assignment] = await db
      .insert(subAssignments)
      .values({
        homeId,
        subcontractorId: input.subcontractorId,
        trade: input.trade,
        scopeDescription: input.scopeDescription,
        completedAt: input.completedAt,
        subWarrantyStart: input.subWarrantyStart,
        subWarrantyMonths: input.subWarrantyMonths || sub.months,
        contractReference: input.contractReference,
      })
      .returning();

    return c.json({ assignment }, 201);
  },
);

const updateAssignmentSchema = createSubAssignmentSchema
  .pick({
    completedAt: true,
    subWarrantyStart: true,
    subWarrantyMonths: true,
    scopeDescription: true,
    contractReference: true,
  })
  .partial();

/** Backfill a missing completion date — the fix for an undocumented trade. */
builderRoutes.patch(
  "/assignments/:assignmentId",
  zValidator("json", updateAssignmentSchema),
  async (c) => {
    const builderId = builderIdOf(c);
    const assignmentId = c.req.param("assignmentId");
    const input = c.req.valid("json");

    const [existing] = await db
      .select({ id: subAssignments.id })
      .from(subAssignments)
      .innerJoin(homes, eq(subAssignments.homeId, homes.id))
      .where(and(eq(subAssignments.id, assignmentId), eq(homes.builderId, builderId)))
      .limit(1);
    if (!existing) {
      return c.json(
        { error: { code: "not_found", message: "No such assignment." } },
        404,
      );
    }

    const [assignment] = await db
      .update(subAssignments)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(subAssignments.id, assignmentId))
      .returning();

    return c.json({ assignment });
  },
);

/**
 * Move a backcharge along its lifecycle.
 *
 * `recoverable` is set automatically at determination time. Everything after
 * it is a person recording what happened: it was invoiced, the sub is arguing,
 * the money arrived, or it was given up on.
 *
 * Without this the "still recoverable" figure could only ever grow, because
 * nothing could take an item off it. A worklist that never shrinks stops being
 * read, which would waste the one number on the scorecard anybody can act on.
 *
 * `expired` and `no_sub_assigned` are deliberately not settable. Those are
 * findings of fact produced by the rules engine from dates, not opinions a
 * coordinator gets to record. To stop owing a claim, write it off explicitly.
 */
builderRoutes.patch(
  "/backcharges/:id",
  zValidator("json", updateBackchargeSchema),
  async (c) => {
    const builderId = builderIdOf(c);
    const user = c.get("user");
    const backchargeId = c.req.param("id");
    const input = c.req.valid("json");

    const [existing] = await db
      .select({ id: backcharges.id, claimId: backcharges.claimId, status: backcharges.status })
      .from(backcharges)
      .innerJoin(claims, eq(backcharges.claimId, claims.id))
      .where(and(eq(backcharges.id, backchargeId), eq(claims.builderId, builderId)))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { code: "not_found", message: "No such backcharge." } },
        404,
      );
    }

    const now = new Date();
    const [backcharge] = await db
      .update(backcharges)
      .set({
        status: input.status,
        ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
        // Stamped once, when it first happens, so the ageing of an unpaid
        // invoice stays readable.
        ...(input.status === "issued" ? { issuedAt: now } : {}),
        ...(input.status === "collected" ? { collectedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(backcharges.id, backchargeId))
      .returning();

    await db.insert(claimEvents).values({
      claimId: existing.claimId,
      actorUserId: user.id,
      kind: "note",
      note:
        `Backcharge moved from ${existing.status.replace(/_/g, " ")} to ` +
        `${input.status.replace(/_/g, " ")}.` +
        (input.note ? ` ${input.note}` : ""),
    });

    return c.json({ backcharge });
  },
);

/** Subcontractors available to assign, for the picker. */
builderRoutes.get("/subcontractors", async (c) => {
  const rows = await db
    .select()
    .from(subcontractors)
    .where(
      and(
        eq(subcontractors.builderId, builderIdOf(c)),
        eq(subcontractors.active, true),
      ),
    );
  return c.json({ subcontractors: rows });
});

/**
 * Subcontractor scorecard: what each sub cost, what is still billable, and
 * what is already gone.
 *
 * The money is split three ways rather than two, because the three mean
 * completely different things to the person reading the page:
 *
 *   open      `recoverable` — the sub's warranty is still open and nobody has
 *             billed them yet. This is a to-do list with a dollar value on it,
 *             and it is the only bucket the coordinator can still act on.
 *   inFlight  `issued` and `disputed` — billed, not yet settled. Chase.
 *   collected `collected` — actually recovered.
 *   lost      `expired`, `no_sub_assigned`, `written_off` — the leak.
 *
 * An earlier version summed `recoverable` together with `collected` under a
 * column labelled "Recovered", which told the coordinator that money still
 * sitting unbilled had already come back, and silently dropped `issued`,
 * `disputed`, and `written_off` from every total. Splitting them is what makes
 * this page a worklist instead of a report.
 *
 * The per-charge detail rides along so a row can be expanded and worked
 * without a second request: the claim it came from, the lot, and the
 * rationale captured at the moment of decision.
 */
builderRoutes.get("/subcontractors/scorecard", async (c) => {
  const builderId = builderIdOf(c);

  const rows = await db
    .select({
      id: subcontractors.id,
      companyName: subcontractors.companyName,
      primaryTrade: subcontractors.primaryTrade,
      contactName: subcontractors.contactName,
      email: subcontractors.email,
      phone: subcontractors.phone,
      insuranceExpiresOn: subcontractors.insuranceExpiresOn,
      lotsWorked: sql<number>`count(distinct ${subAssignments.homeId})::int`,
      undocumentedAssignments: sql<number>`count(*) filter (where ${subAssignments.completedAt} is null)::int`,
    })
    .from(subcontractors)
    .leftJoin(subAssignments, eq(subAssignments.subcontractorId, subcontractors.id))
    .where(eq(subcontractors.builderId, builderId))
    .groupBy(
      subcontractors.id,
      subcontractors.companyName,
      subcontractors.primaryTrade,
      subcontractors.contactName,
      subcontractors.email,
      subcontractors.phone,
      subcontractors.insuranceExpiresOn,
    );

  const charges = await db
    .select({
      id: backcharges.id,
      subcontractorId: backcharges.subcontractorId,
      status: backcharges.status,
      amountCents: backcharges.amountCents,
      rationale: backcharges.rationale,
      daysLate: backcharges.daysLate,
      claimId: claims.id,
      claimReference: claims.reference,
      claimTitle: claims.title,
      claimTrade: claims.trade,
      lotNumber: homes.lotNumber,
    })
    .from(backcharges)
    .innerJoin(claims, eq(backcharges.claimId, claims.id))
    .innerJoin(homes, eq(claims.homeId, homes.id))
    .where(eq(claims.builderId, builderId));

  const OPEN = new Set(["recoverable"]);
  const IN_FLIGHT = new Set(["issued", "disputed"]);
  const LOST = new Set(["expired", "no_sub_assigned", "written_off"]);

  const scorecard = rows.map((sub) => {
    const mine = charges.filter((ch) => ch.subcontractorId === sub.id);
    const sum = (predicate: (status: string) => boolean) =>
      mine
        .filter((m) => predicate(m.status))
        .reduce((total, m) => total + (m.amountCents ?? 0), 0);

    const openCents = sum((s) => OPEN.has(s));
    const inFlightCents = sum((s) => IN_FLIGHT.has(s));
    const collectedCents = sum((s) => s === "collected");
    const lostCents = sum((s) => LOST.has(s));

    return {
      ...sub,
      claimCount: mine.length,
      openCents,
      inFlightCents,
      collectedCents,
      lostCents,
      /*
       * Of the money that has actually been resolved, how much came back.
       * Open and in-flight are deliberately excluded — counting them would
       * flatter the rate with money nobody has collected yet.
       */
      recoveryRate:
        collectedCents + lostCents > 0
          ? collectedCents / (collectedCents + lostCents)
          : null,
      backcharges: mine.map((m) => ({
        id: m.id,
        claimId: m.claimId,
        claimReference: m.claimReference,
        claimTitle: m.claimTitle,
        trade: m.claimTrade,
        lotNumber: m.lotNumber,
        status: m.status,
        amountCents: m.amountCents,
        rationale: m.rationale,
        daysLate: m.daysLate,
      })),
    };
  });

  // Billable money first: it is the only column anyone can still act on.
  // Then the leak, which is the procurement conversation.
  scorecard.sort(
    (a, b) =>
      b.openCents + b.inFlightCents - (a.openCents + a.inFlightCents) ||
      b.lostCents - a.lostCents,
  );

  return c.json({ subcontractors: scorecard });
});

/**
 * Plan-level defect patterns.
 *
 * Plans repeat. Six shower-pan failures across forty homes of the same plan is
 * a design or installation defect, not six unrelated claims — and it should
 * surface at home six, not home thirty.
 */
builderRoutes.get("/patterns", async (c) => {
  const builderId = builderIdOf(c);

  const rows = await db
    .select({
      planId: plans.id,
      planName: plans.name,
      elevation: plans.elevation,
      trade: claims.trade,
      claimCount: sql<number>`count(*)::int`,
      affectedHomes: sql<number>`count(distinct ${claims.homeId})::int`,
      coveredCount: sql<number>`count(*) filter (where ${determinations.outcome} = 'covered')::int`,
    })
    .from(claims)
    .innerJoin(homes, eq(claims.homeId, homes.id))
    .innerJoin(plans, eq(homes.planId, plans.id))
    .leftJoin(determinations, eq(determinations.claimId, claims.id))
    .where(and(eq(claims.builderId, builderId), sql`${claims.trade} is not null`))
    .groupBy(plans.id, plans.name, plans.elevation, claims.trade)
    .having(sql`count(distinct ${claims.homeId}) >= 2`)
    .orderBy(sql`count(distinct ${claims.homeId}) desc`);

  const totalsByPlan = await db
    .select({
      planId: homes.planId,
      homeCount: sql<number>`count(*)::int`,
    })
    .from(homes)
    .where(eq(homes.builderId, builderId))
    .groupBy(homes.planId);

  return c.json({
    patterns: rows.map((r) => {
      const total = totalsByPlan.find((t) => t.planId === r.planId)?.homeCount ?? 0;
      return {
        ...r,
        homesOnPlan: total,
        incidenceRate: total > 0 ? r.affectedHomes / total : null,
      };
    }),
  });
});
