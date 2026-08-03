import { zValidator } from "@hono/zod-validator";
import {
  CLAIM_STATUSES,
  CLOSED_CLAIM_STATUSES,
  createClaimSchema,
  createDeterminationSchema,
  photoMetadataSchema,
  updateClaimStatusSchema,
  type ClaimStatus,
} from "@warranted/shared";
import {
  backchargeRecoverability,
  today,
  type IsoDate,
  type SubAssignmentInput,
} from "@warranted/warranty";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import { triageClaim, TriageUnavailableError } from "../ai/triage.js";
import { db } from "../db/index.js";
import {
  aiAssessments,
  backcharges,
  claimEvents,
  claimPhotos,
  claims,
  communities,
  determinations,
  homes,
  plans,
  subAssignments,
  subcontractors,
  coverageTerms,
  performanceTolerances,
  warrantyDocuments,
} from "../db/schema.js";
import { env } from "../env.js";
import {
  builderIdOf,
  canAccessHome,
  currentHomeIdsFor,
  requireAuth,
  requireBuilderStaff,
  type AppEnv,
} from "../middleware/auth.js";

export const claimRoutes = new Hono<AppEnv>();
claimRoutes.use("*", requireAuth);

const EARTH_RADIUS_M = 6_371_000;
/** Generous enough for GPS drift and a large lot; tight enough to catch a different address. */
const GEO_TOLERANCE_M = 250;

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

async function nextReference(builderId: string): Promise<string> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(claims)
    .where(eq(claims.builderId, builderId));
  return `WC-${1000 + (row?.count ?? 0) + 1}`;
}

// ---------------------------------------------------------------------------
// photo upload — happens before claim creation so the app can upload while the
// homeowner is still typing
// ---------------------------------------------------------------------------

claimRoutes.post("/photos", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  const file = form.get("file");
  const homeId = String(form.get("homeId") ?? "");

  if (!(file instanceof File)) {
    return c.json(
      { error: { code: "missing_file", message: "Attach a photo as `file`." } },
      400,
    );
  }
  if (!(await canAccessHome(user, homeId))) {
    return c.json({ error: { code: "forbidden", message: "Not permitted." } }, 403);
  }

  const metadata = photoMetadataSchema.safeParse(
    JSON.parse(String(form.get("metadata") ?? "{}")),
  );
  if (!metadata.success) {
    return c.json(
      {
        error: {
          code: "invalid_metadata",
          message: "Photo metadata is malformed.",
          details: metadata.error.flatten(),
        },
      },
      400,
    );
  }

  const [home] = await db
    .select({ latitude: homes.latitude, longitude: homes.longitude })
    .from(homes)
    .where(eq(homes.id, homeId))
    .limit(1);

  // Geo verification is only meaningful when both the photo and the lot carry
  // coordinates. Null means "not checkable", which is different from "failed".
  let geoVerified: boolean | null = null;
  let distance: number | null = null;
  if (
    metadata.data.latitude !== null &&
    metadata.data.longitude !== null &&
    home?.latitude != null &&
    home?.longitude != null
  ) {
    distance = distanceMeters(
      { lat: metadata.data.latitude, lng: metadata.data.longitude },
      { lat: home.latitude, lng: home.longitude },
    );
    geoVerified = distance <= GEO_TOLERANCE_M;
  }

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const id = randomUUID();
  const ext = extname(file.name) || ".jpg";
  const filename = `${id}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(env.UPLOAD_DIR, filename), bytes);

  const [photo] = await db
    .insert(claimPhotos)
    .values({
      id,
      claimId: null,
      uploadedByUserId: user.id,
      fileUrl: `/uploads/${filename}`,
      contentType: file.type || "image/jpeg",
      byteSize: bytes.byteLength,
      exifTakenAt: metadata.data.takenAt ? new Date(metadata.data.takenAt) : null,
      latitude: metadata.data.latitude,
      longitude: metadata.data.longitude,
      geoVerified,
      distanceFromHomeMeters: distance,
      width: metadata.data.width,
      height: metadata.data.height,
    })
    .returning();

  return c.json({ photo }, 201);
});

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------

claimRoutes.post("/", zValidator("json", createClaimSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");

  if (!(await canAccessHome(user, input.homeId))) {
    return c.json({ error: { code: "forbidden", message: "Not permitted." } }, 403);
  }

  const [home] = await db
    .select({ builderId: homes.builderId })
    .from(homes)
    .where(eq(homes.id, input.homeId))
    .limit(1);
  if (!home) {
    return c.json({ error: { code: "not_found", message: "No such home." } }, 404);
  }

  const reference = await nextReference(home.builderId);

  const [claim] = await db
    .insert(claims)
    .values({
      builderId: home.builderId,
      homeId: input.homeId,
      reportedByUserId: user.id,
      reference,
      title: input.title,
      description: input.description,
      room: input.room ?? null,
      reportedSeverity: input.reportedSeverity,
      reportedOn: today(),
      status: "submitted",
    })
    .returning();

  if (!claim) throw new Error("claim insert returned no row");

  if (input.photoIds.length > 0) {
    await db
      .update(claimPhotos)
      .set({ claimId: claim.id })
      .where(inArray(claimPhotos.id, input.photoIds));
  }

  await db.insert(claimEvents).values({
    claimId: claim.id,
    actorUserId: user.id,
    kind: "submitted",
    toStatus: "submitted",
    note: `Filed by ${user.fullName}.`,
  });

  return c.json({ claim }, 201);
});

claimRoutes.get("/", async (c) => {
  const user = c.get("user");
  // Validate before it reaches a Postgres enum comparison — an unrecognised
  // string would otherwise become a runtime error from the driver.
  const statusParam = c.req.query("status");
  const status = CLAIM_STATUSES.includes(statusParam as ClaimStatus)
    ? (statusParam as ClaimStatus)
    : undefined;

  const scope =
    user.role === "homeowner"
      ? inArray(claims.homeId, await currentHomeIdsFor(user.id))
      : eq(claims.builderId, builderIdOf(c));

  const rows = await db
    .select({
      claim: claims,
      home: { id: homes.id, lotNumber: homes.lotNumber, addressLine1: homes.addressLine1 },
      community: { id: communities.id, name: communities.name },
    })
    .from(claims)
    .innerJoin(homes, eq(claims.homeId, homes.id))
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .where(status ? and(scope, eq(claims.status, status)) : scope)
    .orderBy(desc(claims.createdAt))
    .limit(200);

  return c.json({ claims: rows });
});

claimRoutes.get("/:claimId", async (c) => {
  const user = c.get("user");
  const claimId = c.req.param("claimId");

  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
  if (!claim || !(await canAccessHome(user, claim.homeId))) {
    return c.json({ error: { code: "not_found", message: "No such claim." } }, 404);
  }

  const [photos, events, assessments, decisions, charges] = await Promise.all([
    db.select().from(claimPhotos).where(eq(claimPhotos.claimId, claimId)),
    db
      .select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(desc(claimEvents.createdAt)),
    db
      .select()
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.createdAt)),
    db.select().from(determinations).where(eq(determinations.claimId, claimId)),
    db.select().from(backcharges).where(eq(backcharges.claimId, claimId)),
  ]);

  return c.json({
    claim,
    photos,
    events,
    // Homeowners see the human decision, never the raw AI proposal — an
    // unreviewed machine opinion is not something to put in front of a customer.
    assessments: user.role === "homeowner" ? [] : assessments,
    determinations: decisions,
    backcharges: user.role === "homeowner" ? [] : charges,
  });
});

/** Run AI triage. Builder-side only, and always re-runnable. */
claimRoutes.post("/:claimId/triage", requireBuilderStaff, async (c) => {
  const claimId = c.req.param("claimId");
  const builderId = builderIdOf(c);

  const [row] = await db
    .select({ claim: claims, home: homes, community: communities, plan: plans })
    .from(claims)
    .innerJoin(homes, eq(claims.homeId, homes.id))
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .leftJoin(plans, eq(homes.planId, plans.id))
    .where(and(eq(claims.id, claimId), eq(claims.builderId, builderId)))
    .limit(1);

  if (!row) {
    return c.json({ error: { code: "not_found", message: "No such claim." } }, 404);
  }

  const [photos, priorClaims, doc] = await Promise.all([
    db.select().from(claimPhotos).where(eq(claimPhotos.claimId, claimId)),
    db
      .select()
      .from(claims)
      .where(and(eq(claims.homeId, row.home.id), sql`${claims.id} <> ${claimId}`))
      .orderBy(desc(claims.reportedOn))
      .limit(25),
    db
      .select()
      .from(warrantyDocuments)
      .where(eq(warrantyDocuments.builderId, builderId))
      .limit(1),
  ]);

  /*
   * The builder's own performance standard, if they have published one here.
   * An empty result is not an error: the rules engine falls back to its
   * built-in placeholder table, and the portal is explicit about which is in
   * use.
   */
  const builderTolerances = await db
    .select()
    .from(performanceTolerances)
    .where(eq(performanceTolerances.builderId, builderId));

  const toleranceTable = builderTolerances.map((row) => ({
    id: row.code,
    trade: row.trade,
    condition: row.condition,
    threshold: row.threshold,
    measurement:
      row.measurementUnit && row.measurementMax !== null
        ? {
            unit: row.measurementUnit as "inch" | "degree" | "count" | "percent",
            maxAcceptable: row.measurementMax,
            ...(row.measurementOver ? { over: row.measurementOver } : {}),
          }
        : null,
    typicalWindowMonths: row.typicalWindowMonths,
    notes: row.notes ?? "",
  }));

  // The clauses a coordinator reviewed and tagged. Loaded after the document
  // because it is what identifies them.
  const reviewedTerms = doc[0]
    ? await db
        .select()
        .from(coverageTerms)
        .where(eq(coverageTerms.documentId, doc[0].id))
    : [];

  try {
    const result = await triageClaim({
      claim: {
        id: row.claim.id,
        title: row.claim.title,
        description: row.claim.description,
        room: row.claim.room,
        reportedSeverity: row.claim.reportedSeverity,
        reportedOn: row.claim.reportedOn as IsoDate,
      },
      home: {
        lotNumber: row.home.lotNumber,
        communityName: row.community.name,
        planName: row.plan?.name ?? null,
        state: row.home.state,
        warrantyStartDate: row.home.warrantyStartDate as IsoDate,
      },
      warrantyDocumentText: doc[0]?.extractedText ?? null,
      ...(toleranceTable.length > 0
        ? {
            tolerances: toleranceTable,
            zeroToleranceIds: builderTolerances
              .filter((r) => r.isZeroTolerance)
              .map((r) => r.code),
          }
        : {}),
      coverageTerms: reviewedTerms.map((term) => ({
        heading: term.heading,
        body: term.body,
        tier: term.tier,
        trade: term.trade,
        isCoverage: term.isCoverage,
      })),
      priorClaims: priorClaims.map((p) => ({
        id: p.id,
        reference: p.reference,
        title: p.title,
        trade: p.trade,
        reportedOn: p.reportedOn as IsoDate,
        status: p.status,
      })),
      photoPaths: photos.map((p) => ({
        path: join(env.UPLOAD_DIR, p.fileUrl.replace("/uploads/", "")),
        contentType: p.contentType,
      })),
    });

    const a = result.assessment;
    const [saved] = await db
      .insert(aiAssessments)
      .values({
        claimId,
        model: result.model,
        promptVersion: result.promptVersion,
        trade: a.trade,
        tier: a.tier,
        severity: a.severity,
        isEmergency: a.isEmergency,
        proposedOutcome: a.proposedOutcome,
        confidence: a.confidence,
        needsHumanReview: a.needsHumanReview,
        summary: a.summary,
        observedCondition: a.observedCondition,
        recommendedNextStep: a.recommendedNextStep,
        citations: a.citations,
        toleranceCheck: a.toleranceCheck,
        possibleDuplicateOfClaimIds: a.possibleDuplicateOfClaimIds,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      })
      .returning();

    await db
      .update(claims)
      .set({
        status: "triaged",
        trade: a.trade,
        tier: a.tier,
        assessedSeverity: a.severity,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));

    await db.insert(claimEvents).values({
      claimId,
      actorUserId: c.get("user").id,
      kind: "ai_triaged",
      fromStatus: row.claim.status,
      toStatus: "triaged",
      note: a.summary,
      metadata: { assessmentId: saved?.id, confidence: a.confidence },
    });

    return c.json({ assessment: saved });
  } catch (error) {
    if (error instanceof TriageUnavailableError) {
      return c.json(
        { error: { code: "triage_unavailable", message: error.message } },
        503,
      );
    }
    throw error;
  }
});

/**
 * The coordinator's decision. This is what actually determines coverage — and
 * it also computes backcharge recoverability at the moment of decision, while
 * the sub's window may still be open.
 */
claimRoutes.post(
  "/:claimId/determination",
  requireBuilderStaff,
  zValidator("json", createDeterminationSchema),
  async (c) => {
    const user = c.get("user");
    const claimId = c.req.param("claimId");
    const input = c.req.valid("json");
    const builderId = builderIdOf(c);

    const [claim] = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.builderId, builderId)))
      .limit(1);
    if (!claim) {
      return c.json({ error: { code: "not_found", message: "No such claim." } }, 404);
    }

    const [decision] = await db
      .insert(determinations)
      .values({
        claimId,
        decidedByUserId: user.id,
        outcome: input.outcome,
        tier: input.tier,
        trade: input.trade,
        reason: input.reason,
        aiAssessmentId: input.aiAssessmentId,
        agreedWithAi: input.agreedWithAi,
        responsibleSubcontractorId: input.responsibleSubcontractorId,
        estimatedCostCents: input.estimatedCostCents,
      })
      .returning();

    const nextStatus = input.outcome === "covered" || input.outcome === "goodwill"
      ? "approved"
      : input.outcome === "manufacturer_warranty" || input.outcome === "insurance_claim"
        ? "referred"
        : "denied";

    await db
      .update(claims)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(claims.id, claimId));

    // Only builder-funded work can be charged back.
    let backcharge = null;
    const trade = input.trade ?? claim.trade;
    if ((input.outcome === "covered" || input.outcome === "goodwill") && trade) {
      const assignments = await db
        .select({ assignment: subAssignments, sub: subcontractors })
        .from(subAssignments)
        .innerJoin(
          subcontractors,
          eq(subAssignments.subcontractorId, subcontractors.id),
        )
        .where(eq(subAssignments.homeId, claim.homeId));

      const inputs: SubAssignmentInput[] = assignments.map(({ assignment, sub }) => ({
        id: assignment.id,
        subcontractorId: assignment.subcontractorId,
        subcontractorName: sub.companyName,
        trade: assignment.trade,
        completedAt: assignment.completedAt as IsoDate | null,
        subWarrantyStart: assignment.subWarrantyStart as IsoDate | null,
        subWarrantyMonths: assignment.subWarrantyMonths,
      }));

      const recoverability = backchargeRecoverability({
        trade,
        claimDate: claim.reportedOn as IsoDate,
        assignments: inputs,
      });

      const [row] = await db
        .insert(backcharges)
        .values({
          claimId,
          subcontractorId:
            input.responsibleSubcontractorId ??
            assignments.find((a) => a.assignment.trade === trade)?.assignment
              .subcontractorId ??
            null,
          subAssignmentId:
            "assignmentId" in recoverability ? recoverability.assignmentId : null,
          status: recoverability.status,
          amountCents: input.estimatedCostCents,
          rationale: recoverability.reason,
          daysLate: recoverability.status === "expired" ? recoverability.daysLate : null,
        })
        .returning();
      backcharge = row ?? null;
    }

    await db.insert(claimEvents).values({
      claimId,
      actorUserId: user.id,
      kind: "determined",
      fromStatus: claim.status,
      toStatus: nextStatus,
      note: input.reason,
      metadata: { outcome: input.outcome, agreedWithAi: input.agreedWithAi },
    });

    return c.json({ determination: decision, backcharge }, 201);
  },
);

claimRoutes.post(
  "/:claimId/status",
  requireBuilderStaff,
  zValidator("json", updateClaimStatusSchema),
  async (c) => {
    const user = c.get("user");
    const claimId = c.req.param("claimId");
    const { status, note } = c.req.valid("json");

    const [claim] = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.builderId, builderIdOf(c))))
      .limit(1);
    if (!claim) {
      return c.json({ error: { code: "not_found", message: "No such claim." } }, 404);
    }

    // A closed claim stays closed. Reopening it would rewrite the timeline a
    // right-to-cure defense depends on — file a new claim instead.
    if (
      CLOSED_CLAIM_STATUSES.includes(claim.status as never) &&
      status !== claim.status
    ) {
      return c.json(
        {
          error: {
            code: "claim_closed",
            message: `This claim is ${claim.status}. Closed claims can't be reopened — file a new one that references it.`,
          },
        },
        409,
      );
    }

    const [updated] = await db
      .update(claims)
      .set({
        status,
        resolvedAt: status === "verified" ? new Date() : claim.resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId))
      .returning();

    await db.insert(claimEvents).values({
      claimId,
      actorUserId: user.id,
      kind: "status_changed",
      fromStatus: claim.status,
      toStatus: status,
      note: note ?? null,
    });

    return c.json({ claim: updated });
  },
);

export const claimQuerySchema = z.object({ status: z.string().optional() });
