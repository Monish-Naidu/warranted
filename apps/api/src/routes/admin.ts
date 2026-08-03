/**
 * Setup write paths: communities, plans, subcontractors, and homes.
 *
 * Until these existed, a builder could only be created by running the seed
 * script, which meant the product could be demonstrated but not deployed.
 *
 * Two rules hold throughout:
 *
 *   Tenancy comes from the JWT. `builderIdOf(c)` is the only source of the
 *   builder id, never the request body, or one builder could write into
 *   another's community by guessing an id. Anything referenced by id (a
 *   community on a home, a plan on a home) is re-checked against the caller's
 *   builder before it is used.
 *
 *   `warranty_start_date` is never derived. Creating a home requires saying
 *   which date started the clock, because closing, certificate of occupancy,
 *   and possession routinely differ and this is the most disputed field in the
 *   domain. An import that guesses is worse than one that refuses.
 */

import { zValidator } from "@hono/zod-validator";
import {
  createCommunitySchema,
  createHomeSchema,
  createPlanSchema,
  createSubcontractorSchema,
  DEFAULT_TIER_MONTHS,
  WARRANTY_TIERS,
} from "@warranted/shared";
import { addMonths, milestoneSchedule, today, type IsoDate } from "@warranted/warranty";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  communities,
  homes,
  milestones,
  plans,
  subcontractors,
  warranties,
  warrantyDocuments,
} from "../db/schema.js";
import { builderIdOf, requireAuth, requireBuilderStaff, type AppEnv } from "../middleware/auth.js";

const NOT_FOUND = (what: string) => ({
  error: { code: "not_found", message: `No such ${what}.` },
});

export const adminRoutes = new Hono<AppEnv>();

// Order matters: requireBuilderStaff reads the user that requireAuth puts on
// the context, so authenticating first is not optional.
adminRoutes.use("*", requireAuth, requireBuilderStaff);

// ---------------------------------------------------------------------------
// communities
// ---------------------------------------------------------------------------

adminRoutes.get("/communities", async (c) => {
  const rows = await db
    .select()
    .from(communities)
    .where(eq(communities.builderId, builderIdOf(c)))
    .orderBy(communities.name);
  return c.json({ communities: rows });
});

adminRoutes.post(
  "/communities",
  zValidator("json", createCommunitySchema),
  async (c) => {
    const [community] = await db
      .insert(communities)
      .values({ ...c.req.valid("json"), builderId: builderIdOf(c) })
      .returning();
    return c.json({ community }, 201);
  },
);

adminRoutes.patch(
  "/communities/:id",
  zValidator("json", createCommunitySchema.partial()),
  async (c) => {
    const [community] = await db
      .update(communities)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(communities.id, c.req.param("id")),
          eq(communities.builderId, builderIdOf(c)),
        ),
      )
      .returning();

    if (!community) return c.json(NOT_FOUND("community"), 404);
    return c.json({ community });
  },
);

// ---------------------------------------------------------------------------
// plans
// ---------------------------------------------------------------------------

adminRoutes.get("/plans", async (c) => {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.builderId, builderIdOf(c)))
    .orderBy(plans.name);
  return c.json({ plans: rows });
});

adminRoutes.post("/plans", zValidator("json", createPlanSchema), async (c) => {
  const [plan] = await db
    .insert(plans)
    .values({ ...c.req.valid("json"), builderId: builderIdOf(c) })
    .returning();
  return c.json({ plan }, 201);
});

adminRoutes.patch(
  "/plans/:id",
  zValidator("json", createPlanSchema.partial()),
  async (c) => {
    const [plan] = await db
      .update(plans)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(eq(plans.id, c.req.param("id")), eq(plans.builderId, builderIdOf(c))),
      )
      .returning();

    if (!plan) return c.json(NOT_FOUND("plan"), 404);
    return c.json({ plan });
  },
);

// ---------------------------------------------------------------------------
// subcontractors
// ---------------------------------------------------------------------------

adminRoutes.post(
  "/subcontractors",
  zValidator("json", createSubcontractorSchema),
  async (c) => {
    const [subcontractor] = await db
      .insert(subcontractors)
      .values({ ...c.req.valid("json"), builderId: builderIdOf(c) })
      .returning();
    return c.json({ subcontractor }, 201);
  },
);

adminRoutes.patch(
  "/subcontractors/:id",
  zValidator("json", createSubcontractorSchema.partial()),
  async (c) => {
    const [subcontractor] = await db
      .update(subcontractors)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(subcontractors.id, c.req.param("id")),
          eq(subcontractors.builderId, builderIdOf(c)),
        ),
      )
      .returning();

    if (!subcontractor) return c.json(NOT_FOUND("subcontractor"), 404);
    return c.json({ subcontractor });
  },
);

// ---------------------------------------------------------------------------
// homes
// ---------------------------------------------------------------------------

/**
 * Create a home, and with it the things that are pure consequence of its
 * warranty start date: one warranty row per tier, and the milestone schedule.
 *
 * Deriving those here rather than asking for them is deliberate. They follow
 * from the start date by rule, and a coordinator hand-entering an end date is
 * a coordinator eventually entering a wrong one.
 */
adminRoutes.post("/homes", zValidator("json", createHomeSchema), async (c) => {
  const builderId = builderIdOf(c);
  const input = c.req.valid("json");

  const [community] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(
      and(
        eq(communities.id, input.communityId),
        eq(communities.builderId, builderId),
      ),
    )
    .limit(1);
  if (!community) return c.json(NOT_FOUND("community"), 404);

  if (input.planId) {
    const [plan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, input.planId), eq(plans.builderId, builderId)))
      .limit(1);
    if (!plan) return c.json(NOT_FOUND("plan"), 404);
  }

  const [home] = await db
    .insert(homes)
    .values({ ...input, builderId })
    .returning();
  if (!home) throw new Error("home insert failed");

  const start = home.warrantyStartDate as IsoDate;

  // The builder's own limited warranty, if one has been loaded. Structural
  // coverage transfers on resale; workmanship and systems do not.
  const [doc] = await db
    .select({ id: warrantyDocuments.id })
    .from(warrantyDocuments)
    .where(eq(warrantyDocuments.builderId, builderId))
    .limit(1);

  await db.insert(warranties).values(
    WARRANTY_TIERS.map((tier) => ({
      homeId: home.id,
      tier,
      startDate: start,
      endDate: addMonths(start, DEFAULT_TIER_MONTHS[tier]),
      documentId: doc?.id ?? null,
      transfersOnResale: tier === "structural",
    })),
  );

  await db.insert(milestones).values(
    milestoneSchedule(start, today()).map((m) => ({
      homeId: home.id,
      kind: m.kind,
      dueDate: m.dueDate,
      status: "pending" as const,
    })),
  );

  return c.json({ home }, 201);
});

adminRoutes.patch(
  "/homes/:id",
  zValidator("json", createHomeSchema.partial()),
  async (c) => {
    const [home] = await db
      .update(homes)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(eq(homes.id, c.req.param("id")), eq(homes.builderId, builderIdOf(c))),
      )
      .returning();

    if (!home) return c.json(NOT_FOUND("home"), 404);
    return c.json({ home });
  },
);
