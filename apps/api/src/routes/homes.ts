import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  finalCoverageDate,
  milestoneSchedule,
  tierCoverage,
  today,
  type IsoDate,
} from "@warranted/warranty";
import { db } from "../db/index.js";
import {
  claims,
  communities,
  homeOwnerships,
  homes,
  milestones,
  plans,
  warranties,
} from "../db/schema.js";
import {
  canAccessHome,
  currentHomeIdsFor,
  requireAuth,
  type AppEnv,
} from "../middleware/auth.js";

export const homeRoutes = new Hono<AppEnv>();

homeRoutes.use("*", requireAuth);

/**
 * The homeowner's dashboard payload: which tiers are still in force, how many
 * days remain on each, and which milestone is next.
 *
 * The countdown is the point. Homeowners lose the workmanship tier because
 * nobody tells them it is closing — so the clock is the first thing the app
 * shows, not a detail buried in a documents tab.
 */
homeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const asOf = today();

  const homeIds =
    user.role === "homeowner"
      ? await currentHomeIdsFor(user.id)
      : (
          await db
            .select({ id: homes.id })
            .from(homes)
            .where(eq(homes.builderId, user.builderId ?? ""))
        ).map((h) => h.id);

  if (homeIds.length === 0) return c.json({ homes: [] });

  const rows = await db
    .select({
      home: homes,
      community: communities,
      plan: plans,
    })
    .from(homes)
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .leftJoin(plans, eq(homes.planId, plans.id))
    .where(inArray(homes.id, homeIds))
    .orderBy(asc(communities.name), asc(homes.lotNumber));

  const milestoneRows = await db
    .select()
    .from(milestones)
    .where(inArray(milestones.homeId, homeIds));

  const payload = rows.map(({ home, community, plan }) => {
    const start = home.warrantyStartDate as IsoDate;
    const coverage = tierCoverage(start, asOf);
    const homeMilestones = milestoneRows
      .filter((m) => m.homeId === home.id)
      .map((m) => {
        const scheduled = milestoneSchedule(start, asOf).find(
          (s) => s.kind === m.kind,
        );
        return {
          kind: m.kind,
          status: m.status,
          dueDate: m.dueDate,
          scheduledFor: m.scheduledFor,
          daysUntilDue: scheduled?.daysUntilDue ?? null,
          isLastChance: m.kind === "eleven_month",
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      id: home.id,
      lotNumber: home.lotNumber,
      address: {
        line1: home.addressLine1,
        line2: home.addressLine2,
        city: home.city,
        state: home.state,
        postalCode: home.postalCode,
      },
      community: { id: community.id, name: community.name },
      plan: plan ? { id: plan.id, name: plan.name, elevation: plan.elevation } : null,
      warranty: {
        startDate: start,
        // Sourced, not derived — this field is the most-disputed in the domain.
        startSource: home.warrantyStartSource,
        startNote: home.warrantyStartNote,
        finalCoverageDate: finalCoverageDate(start),
        tiers: coverage,
      },
      milestones: homeMilestones,
      nextMilestone:
        homeMilestones.find((m) => m.status === "pending" || m.status === "scheduled") ??
        null,
    };
  });

  return c.json({ homes: payload });
});

homeRoutes.get("/:homeId", async (c) => {
  const user = c.get("user");
  const homeId = c.req.param("homeId");

  if (!(await canAccessHome(user, homeId))) {
    return c.json(
      { error: { code: "not_found", message: "No such home." } },
      404,
    );
  }

  const [row] = await db
    .select({ home: homes, community: communities, plan: plans })
    .from(homes)
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .leftJoin(plans, eq(homes.planId, plans.id))
    .where(eq(homes.id, homeId))
    .limit(1);

  if (!row) {
    return c.json({ error: { code: "not_found", message: "No such home." } }, 404);
  }

  const start = row.home.warrantyStartDate as IsoDate;
  const asOf = today();

  const [warrantyRows, claimRows, ownerRows] = await Promise.all([
    db.select().from(warranties).where(eq(warranties.homeId, homeId)),
    db
      .select()
      .from(claims)
      .where(eq(claims.homeId, homeId))
      .orderBy(desc(claims.reportedOn)),
    db.select().from(homeOwnerships).where(eq(homeOwnerships.homeId, homeId)),
  ]);

  return c.json({
    home: {
      ...row.home,
      community: row.community,
      plan: row.plan,
      coverage: tierCoverage(start, asOf),
      milestones: milestoneSchedule(start, asOf),
    },
    warranties: warrantyRows,
    claims: claimRows,
    ownerships: ownerRows,
  });
});

/** Milestone scheduling — the coordinator's action on the 11-month alert. */
homeRoutes.post("/:homeId/milestones/:kind/schedule", async (c) => {
  const user = c.get("user");
  const homeId = c.req.param("homeId");
  const kind = c.req.param("kind");

  if (user.role === "homeowner" || !(await canAccessHome(user, homeId))) {
    return c.json(
      { error: { code: "forbidden", message: "Not permitted." } },
      403,
    );
  }

  const body = await c.req.json<{ scheduledFor: string }>();
  const scheduledFor = new Date(body.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    return c.json(
      { error: { code: "invalid_date", message: "scheduledFor must be a valid date." } },
      400,
    );
  }

  const [updated] = await db
    .update(milestones)
    .set({ status: "scheduled", scheduledFor, updatedAt: new Date() })
    .where(
      and(
        eq(milestones.homeId, homeId),
        eq(milestones.kind, kind as "orientation" | "thirty_day" | "eleven_month"),
      ),
    )
    .returning();

  if (!updated) {
    return c.json(
      { error: { code: "not_found", message: "No such milestone." } },
      404,
    );
  }

  return c.json({ milestone: updated });
});
