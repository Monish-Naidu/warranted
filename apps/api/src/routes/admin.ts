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
  createCoverageTermSchema,
  createHomeSchema,
  createPlanSchema,
  createSubcontractorSchema,
  createWarrantyDocumentSchema,
  DEFAULT_TIER_MONTHS,
  WARRANTY_TIERS,
} from "@warranted/shared";
import { addMonths, milestoneSchedule, today, type IsoDate } from "@warranted/warranty";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  communities,
  coverageTerms,
  homes,
  milestones,
  plans,
  subcontractors,
  warranties,
  warrantyDocuments,
} from "../db/schema.js";
import {
  ClauseExtractionUnavailableError,
  suggestClauses,
} from "../ai/clauses.js";
import { builderIdOf, requireAuth, requireBuilderStaff, type AppEnv } from "../middleware/auth.js";

const NOT_FOUND = (what: string) => ({
  error: { code: "not_found", message: `No such ${what}.` },
});

export const adminRoutes = new Hono<AppEnv>();

// Order matters: requireBuilderStaff reads the user that requireAuth puts on
// the context, so authenticating first is not optional.
adminRoutes.use("*", requireAuth, requireBuilderStaff);

// ---------------------------------------------------------------------------
// warranty documents and their clauses
// ---------------------------------------------------------------------------

/**
 * Pull text out of an uploaded file.
 *
 * Only the text is kept. The original file would need object storage, which
 * this deployment does not have, and `extractedText` is the field that
 * actually does the work: it is what triage reads and what clause extraction
 * runs over.
 */
adminRoutes.post("/warranty-documents/extract-file", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return c.json(
      { error: { code: "missing_file", message: "Attach the document as `file`." } },
      400,
    );
  }

  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".pdf")) {
      // Imported lazily so a text-only upload never pays for loading the PDF
      // machinery, and so a bundling problem cannot break the whole route file.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const { text, totalPages } = await extractText(pdf, { mergePages: true });

      if (!text.trim()) {
        return c.json(
          {
            error: {
              code: "no_text",
              message:
                "No text could be read from that PDF. It is probably a scan. Paste the text instead.",
            },
          },
          422,
        );
      }
      return c.json({ text, pages: totalPages, filename: file.name });
    }

    const text = await file.text();
    if (!text.trim()) {
      return c.json(
        { error: { code: "no_text", message: "That file is empty." } },
        422,
      );
    }
    return c.json({ text, pages: null, filename: file.name });
  } catch (error) {
    return c.json(
      {
        error: {
          code: "extract_failed",
          message: `Could not read that file: ${
            error instanceof Error ? error.message : "unknown error"
          }. Paste the text instead.`,
        },
      },
      422,
    );
  }
});

adminRoutes.get("/warranty-documents", async (c) => {
  const builderId = builderIdOf(c);

  const docs = await db
    .select()
    .from(warrantyDocuments)
    .where(eq(warrantyDocuments.builderId, builderId))
    .orderBy(desc(warrantyDocuments.createdAt));

  const terms = docs.length
    ? await db
        .select()
        .from(coverageTerms)
        .where(
          inArray(
            coverageTerms.documentId,
            docs.map((d) => d.id),
          ),
        )
        .orderBy(asc(coverageTerms.pageNumber), asc(coverageTerms.heading))
    : [];

  return c.json({
    documents: docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      effectiveDate: doc.effectiveDate,
      homeId: doc.homeId,
      // The full text can be long; the client asks for one document at a time
      // when it needs the body.
      textLength: doc.extractedText?.length ?? 0,
      terms: terms.filter((t) => t.documentId === doc.id),
    })),
  });
});

adminRoutes.get("/warranty-documents/:id", async (c) => {
  const [doc] = await db
    .select()
    .from(warrantyDocuments)
    .where(
      and(
        eq(warrantyDocuments.id, c.req.param("id")),
        eq(warrantyDocuments.builderId, builderIdOf(c)),
      ),
    )
    .limit(1);

  if (!doc) return c.json(NOT_FOUND("warranty document"), 404);

  const terms = await db
    .select()
    .from(coverageTerms)
    .where(eq(coverageTerms.documentId, doc.id))
    .orderBy(asc(coverageTerms.pageNumber), asc(coverageTerms.heading));

  return c.json({ document: doc, terms });
});

adminRoutes.post(
  "/warranty-documents",
  zValidator("json", createWarrantyDocumentSchema),
  async (c) => {
    const [document] = await db
      .insert(warrantyDocuments)
      .values({ ...c.req.valid("json"), builderId: builderIdOf(c) })
      .returning();
    return c.json({ document }, 201);
  },
);

adminRoutes.patch(
  "/warranty-documents/:id",
  zValidator("json", createWarrantyDocumentSchema.partial()),
  async (c) => {
    const [document] = await db
      .update(warrantyDocuments)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(
        and(
          eq(warrantyDocuments.id, c.req.param("id")),
          eq(warrantyDocuments.builderId, builderIdOf(c)),
        ),
      )
      .returning();

    if (!document) return c.json(NOT_FOUND("warranty document"), 404);
    return c.json({ document });
  },
);

/**
 * Ask the model to break the document into clauses.
 *
 * Nothing is written. The proposals come back for a coordinator to review,
 * edit, and save, because a wrong clause tag is quietly wrong on every claim
 * that cites it afterwards.
 */
adminRoutes.post("/warranty-documents/:id/suggest-terms", async (c) => {
  const [doc] = await db
    .select()
    .from(warrantyDocuments)
    .where(
      and(
        eq(warrantyDocuments.id, c.req.param("id")),
        eq(warrantyDocuments.builderId, builderIdOf(c)),
      ),
    )
    .limit(1);

  if (!doc) return c.json(NOT_FOUND("warranty document"), 404);

  if (!doc.extractedText?.trim()) {
    return c.json(
      {
        error: {
          code: "no_text",
          message: "This document has no text to read.",
        },
      },
      400,
    );
  }

  try {
    const result = await suggestClauses(doc.extractedText, doc.title);
    return c.json(result);
  } catch (error) {
    if (error instanceof ClauseExtractionUnavailableError) {
      return c.json(
        { error: { code: "ai_unavailable", message: error.message } },
        503,
      );
    }
    return c.json(
      {
        error: {
          code: "extraction_failed",
          message: error instanceof Error ? error.message : "Extraction failed.",
        },
      },
      502,
    );
  }
});

/** Save reviewed clauses. Accepts one or many, so a whole reviewed batch lands together. */
adminRoutes.post(
  "/warranty-documents/:id/terms",
  zValidator("json", z.object({ terms: z.array(createCoverageTermSchema).min(1) })),
  async (c) => {
    const [doc] = await db
      .select({ id: warrantyDocuments.id })
      .from(warrantyDocuments)
      .where(
        and(
          eq(warrantyDocuments.id, c.req.param("id")),
          eq(warrantyDocuments.builderId, builderIdOf(c)),
        ),
      )
      .limit(1);

    if (!doc) return c.json(NOT_FOUND("warranty document"), 404);

    const saved = await db
      .insert(coverageTerms)
      .values(
        c.req.valid("json").terms.map((term) => ({ ...term, documentId: doc.id })),
      )
      .returning();

    return c.json({ terms: saved }, 201);
  },
);

adminRoutes.patch(
  "/coverage-terms/:id",
  zValidator("json", createCoverageTermSchema.partial()),
  async (c) => {
    // Scoped through the document, since coverage_terms has no builder column.
    const [existing] = await db
      .select({ id: coverageTerms.id })
      .from(coverageTerms)
      .innerJoin(
        warrantyDocuments,
        eq(coverageTerms.documentId, warrantyDocuments.id),
      )
      .where(
        and(
          eq(coverageTerms.id, c.req.param("id")),
          eq(warrantyDocuments.builderId, builderIdOf(c)),
        ),
      )
      .limit(1);

    if (!existing) return c.json(NOT_FOUND("clause"), 404);

    const [term] = await db
      .update(coverageTerms)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(coverageTerms.id, c.req.param("id")))
      .returning();

    return c.json({ term });
  },
);

adminRoutes.delete("/coverage-terms/:id", async (c) => {
  const [existing] = await db
    .select({ id: coverageTerms.id })
    .from(coverageTerms)
    .innerJoin(
      warrantyDocuments,
      eq(coverageTerms.documentId, warrantyDocuments.id),
    )
    .where(
      and(
        eq(coverageTerms.id, c.req.param("id")),
        eq(warrantyDocuments.builderId, builderIdOf(c)),
      ),
    )
    .limit(1);

  if (!existing) return c.json(NOT_FOUND("clause"), 404);

  await db.delete(coverageTerms).where(eq(coverageTerms.id, c.req.param("id")));
  return c.json({ ok: true });
});

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
