import { zValidator } from "@hono/zod-validator";
import { createSubAssignmentSchema } from "@warranted/shared";
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
 * Subcontractor scorecard — claim rate, warranty spend, and recovery rate.
 *
 * This is procurement leverage. A sub who generates three times the claims of
 * their peers on the same plan is a pricing conversation, and until now nobody
 * had the data assembled to have it.
 */
builderRoutes.get("/subcontractors/scorecard", async (c) => {
  const builderId = builderIdOf(c);

  const rows = await db
    .select({
      id: subcontractors.id,
      companyName: subcontractors.companyName,
      primaryTrade: subcontractors.primaryTrade,
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
      subcontractors.insuranceExpiresOn,
    );

  const charges = await db
    .select({
      subcontractorId: backcharges.subcontractorId,
      status: backcharges.status,
      total: sql<number>`coalesce(sum(${backcharges.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(backcharges)
    .innerJoin(claims, eq(backcharges.claimId, claims.id))
    .where(eq(claims.builderId, builderId))
    .groupBy(backcharges.subcontractorId, backcharges.status);

  const scorecard = rows.map((sub) => {
    const mine = charges.filter((ch) => ch.subcontractorId === sub.id);
    const recoverableCents = mine
      .filter((m) => m.status === "recoverable" || m.status === "collected")
      .reduce((s, m) => s + m.total, 0);
    const lostCents = mine
      .filter((m) => m.status === "expired" || m.status === "no_sub_assigned")
      .reduce((s, m) => s + m.total, 0);

    return {
      ...sub,
      claimCount: mine.reduce((s, m) => s + m.count, 0),
      recoverableCents,
      // Warranty cost the builder could not pass back — the leak, per sub.
      unrecoverableCents: lostCents,
      recoveryRate:
        recoverableCents + lostCents > 0
          ? recoverableCents / (recoverableCents + lostCents)
          : null,
    };
  });

  scorecard.sort((a, b) => b.unrecoverableCents - a.unrecoverableCents);
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
