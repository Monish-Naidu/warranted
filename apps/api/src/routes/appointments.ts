/**
 * Scheduling.
 *
 * `docs/DOMAIN.md` names this as the real operational bottleneck, above
 * adjudication: deciding whether a crack is covered takes two minutes, and
 * getting a homeowner, a superintendent, and a sub into the same two-hour
 * window takes two weeks and four phone calls. The tables have existed since
 * the first migration with nothing reading them. This is that.
 *
 * Two things the schema was shaped around, and this preserves:
 *
 *   Batching. `appointment_claims` is many-to-many so several claims on one
 *   home can share a visit. A house getting five separate trips for five small
 *   defects is the failure this exists to prevent, so the create path takes a
 *   list of claims rather than one.
 *
 *   Confirmation. `homeowner_confirmed` defaults to false and only the
 *   homeowner can set it. An unconfirmed appointment is a truck roll waiting to
 *   be wasted, so it is tracked separately from the appointment existing.
 */

import { zValidator } from "@hono/zod-validator";
import { scheduleAppointmentSchema, updateAppointmentSchema } from "@warranted/shared";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  appointmentClaims,
  appointments,
  claimEvents,
  claims,
  communities,
  homes,
  subcontractors,
} from "../db/schema.js";
import {
  builderIdOf,
  requireAuth,
  requireBuilderStaff,
  type AppEnv,
} from "../middleware/auth.js";

export const appointmentRoutes = new Hono<AppEnv>();

appointmentRoutes.use("*", requireAuth);

/**
 * The schedule board. Upcoming first, since a past appointment is history and
 * an upcoming one is work.
 */
appointmentRoutes.get("/", requireBuilderStaff, async (c) => {
  const builderId = builderIdOf(c);
  const includePast = c.req.query("past") === "true";

  const rows = await db
    .select({
      appointment: appointments,
      home: homes,
      community: communities,
      subcontractor: subcontractors,
    })
    .from(appointments)
    .innerJoin(homes, eq(appointments.homeId, homes.id))
    .innerJoin(communities, eq(homes.communityId, communities.id))
    .leftJoin(
      subcontractors,
      eq(appointments.subcontractorId, subcontractors.id),
    )
    .where(
      includePast
        ? eq(homes.builderId, builderId)
        : and(
            eq(homes.builderId, builderId),
            gte(appointments.scheduledFor, startOfToday()),
          ),
    )
    .orderBy(asc(appointments.scheduledFor));

  const ids = rows.map((r) => r.appointment.id);
  const linked = ids.length
    ? await db
        .select({
          appointmentId: appointmentClaims.appointmentId,
          claimId: claims.id,
          reference: claims.reference,
          title: claims.title,
          trade: claims.trade,
          status: claims.status,
        })
        .from(appointmentClaims)
        .innerJoin(claims, eq(appointmentClaims.claimId, claims.id))
        .where(inArray(appointmentClaims.appointmentId, ids))
    : [];

  return c.json({
    appointments: rows.map(({ appointment, home, community, subcontractor }) => ({
      id: appointment.id,
      scheduledFor: appointment.scheduledFor,
      windowMinutes: appointment.windowMinutes,
      homeownerConfirmed: appointment.homeownerConfirmed,
      completedAt: appointment.completedAt,
      notes: appointment.notes,
      home: {
        id: home.id,
        lotNumber: home.lotNumber,
        address: home.addressLine1,
        community: community.name,
      },
      subcontractor: subcontractor
        ? {
            id: subcontractor.id,
            companyName: subcontractor.companyName,
            phone: subcontractor.phone,
            email: subcontractor.email,
          }
        : null,
      claims: linked.filter((l) => l.appointmentId === appointment.id),
    })),
  });
});

/**
 * Book a visit against one or more claims.
 *
 * Every claim is re-checked against the caller's builder and against the home
 * being visited, so an appointment cannot be made to carry a claim from
 * somewhere else.
 */
appointmentRoutes.post(
  "/",
  requireBuilderStaff,
  zValidator("json", scheduleAppointmentSchema),
  async (c) => {
    const builderId = builderIdOf(c);
    const user = c.get("user");
    const input = c.req.valid("json");

    const [home] = await db
      .select({ id: homes.id })
      .from(homes)
      .where(and(eq(homes.id, input.homeId), eq(homes.builderId, builderId)))
      .limit(1);
    if (!home) {
      return c.json({ error: { code: "not_found", message: "No such home." } }, 404);
    }

    const attachable = await db
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          inArray(claims.id, input.claimIds),
          eq(claims.builderId, builderId),
          eq(claims.homeId, input.homeId),
        ),
      );

    if (attachable.length !== input.claimIds.length) {
      return c.json(
        {
          error: {
            code: "invalid_claims",
            message:
              "Every claim must belong to this builder and to the home being visited.",
          },
        },
        400,
      );
    }

    const [appointment] = await db
      .insert(appointments)
      .values({
        homeId: input.homeId,
        subcontractorId: input.subcontractorId,
        scheduledFor: new Date(input.scheduledFor),
        windowMinutes: input.windowMinutes,
        notes: input.notes,
      })
      .returning();
    if (!appointment) throw new Error("appointment insert failed");

    await db.insert(appointmentClaims).values(
      attachable.map((claim) => ({
        appointmentId: appointment.id,
        claimId: claim.id,
      })),
    );

    // Scheduling is a status change, and the claim history is what a dispute
    // is eventually read from.
    await db
      .update(claims)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(inArray(claims.id, attachable.map((x) => x.id)));

    await db.insert(claimEvents).values(
      attachable.map((claim) => ({
        claimId: claim.id,
        actorUserId: user.id,
        kind: "scheduled" as const,
        toStatus: "scheduled" as const,
        note: `Visit booked for ${new Date(input.scheduledFor).toLocaleString()}${
          attachable.length > 1
            ? `, batched with ${attachable.length - 1} other claim(s) on this home`
            : ""
        }.`,
      })),
    );

    return c.json({ appointment }, 201);
  },
);

/**
 * Reschedule, reassign, confirm, or complete.
 *
 * `homeownerConfirmed` is deliberately the one field a homeowner may set, and
 * the only one they may. A coordinator marking a slot confirmed on the
 * homeowner's behalf is how a wasted truck roll gets recorded as a success.
 */
appointmentRoutes.patch(
  "/:id",
  zValidator("json", updateAppointmentSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const appointmentId = c.req.param("id");

    const [existing] = await db
      .select({ appointment: appointments, home: homes })
      .from(appointments)
      .innerJoin(homes, eq(appointments.homeId, homes.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { code: "not_found", message: "No such appointment." } },
        404,
      );
    }

    const isStaff = user.role !== "homeowner";
    if (isStaff && existing.home.builderId !== user.builderId) {
      return c.json(
        { error: { code: "not_found", message: "No such appointment." } },
        404,
      );
    }

    if (!isStaff) {
      const owns = await db
        .select({ homeId: homes.id })
        .from(homes)
        .where(eq(homes.id, existing.home.id))
        .limit(1);
      const confirmingOnly =
        Object.keys(input).length === 1 && input.homeownerConfirmed !== undefined;
      if (owns.length === 0 || !confirmingOnly) {
        return c.json(
          {
            error: {
              code: "forbidden",
              message: "A homeowner may only confirm an appointment.",
            },
          },
          403,
        );
      }
    }

    const [appointment] = await db
      .update(appointments)
      .set({
        ...(input.scheduledFor ? { scheduledFor: new Date(input.scheduledFor) } : {}),
        ...(input.windowMinutes !== undefined
          ? { windowMinutes: input.windowMinutes }
          : {}),
        ...(input.subcontractorId !== undefined
          ? { subcontractorId: input.subcontractorId }
          : {}),
        ...(input.homeownerConfirmed !== undefined
          ? { homeownerConfirmed: input.homeownerConfirmed }
          : {}),
        ...(input.completed !== undefined
          ? { completedAt: input.completed ? new Date() : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, appointmentId))
      .returning();

    // Completing a visit moves its claims on, which is the point of recording
    // it at all.
    if (input.completed === true) {
      const linked = await db
        .select({ claimId: appointmentClaims.claimId })
        .from(appointmentClaims)
        .where(eq(appointmentClaims.appointmentId, appointmentId));

      if (linked.length > 0) {
        const claimIds = linked.map((l) => l.claimId);
        await db
          .update(claims)
          .set({ status: "completed", updatedAt: new Date() })
          .where(inArray(claims.id, claimIds));

        await db.insert(claimEvents).values(
          claimIds.map((claimId) => ({
            claimId,
            actorUserId: user.id,
            kind: "status_changed" as const,
            fromStatus: "scheduled" as const,
            toStatus: "completed" as const,
            note: "Visit completed. Awaiting homeowner confirmation.",
          })),
        );
      }
    }

    return c.json({ appointment });
  },
);

appointmentRoutes.delete("/:id", requireBuilderStaff, async (c) => {
  const builderId = builderIdOf(c);
  const appointmentId = c.req.param("id");

  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(homes, eq(appointments.homeId, homes.id))
    .where(and(eq(appointments.id, appointmentId), eq(homes.builderId, builderId)))
    .limit(1);

  if (!existing) {
    return c.json(
      { error: { code: "not_found", message: "No such appointment." } },
      404,
    );
  }

  // The claims go back to approved rather than to their original status: the
  // work was agreed, only the visit was cancelled.
  const linked = await db
    .select({ claimId: appointmentClaims.claimId })
    .from(appointmentClaims)
    .where(eq(appointmentClaims.appointmentId, appointmentId));

  if (linked.length > 0) {
    await db
      .update(claims)
      .set({ status: "approved", updatedAt: new Date() })
      .where(inArray(claims.id, linked.map((l) => l.claimId)));
  }

  await db.delete(appointments).where(eq(appointments.id, appointmentId));

  return c.json({ ok: true });
});

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
