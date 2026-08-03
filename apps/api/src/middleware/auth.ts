import { BUILDER_ROLES, type Role, type SessionUser } from "@warranted/shared";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Context, MiddlewareHandler, Next } from "hono";
import { verifyToken } from "../auth/jwt.js";
import { db } from "../db/index.js";
import { homeOwnerships, homes } from "../db/schema.js";

export interface AppEnv {
  Variables: {
    user: SessionUser;
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json(
      { error: { code: "unauthenticated", message: "Missing bearer token." } },
      401,
    );
  }

  const user = await verifyToken(header.slice(7));
  if (!user) {
    return c.json(
      { error: { code: "unauthenticated", message: "Invalid or expired token." } },
      401,
    );
  }

  c.set("user", user);
  await next();
};

export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!allowed.includes(user.role)) {
      return c.json(
        {
          error: {
            code: "forbidden",
            message: "Your role does not have access to this resource.",
          },
        },
        403,
      );
    }
    await next();
  };
}

/** Any builder-side staff role. Homeowners are excluded. */
export const requireBuilderStaff = requireRole(...BUILDER_ROLES);

/**
 * The tenant boundary. Every builder-scoped query must filter on this rather
 * than trusting a `builderId` from the request body — otherwise one builder can
 * read another's lots by guessing an id.
 */
export function builderIdOf(c: Context<AppEnv>): string {
  const user = c.get("user");
  if (!user.builderId) {
    throw new Error("builder-scoped route reached without a builder context");
  }
  return user.builderId;
}

/**
 * Can this user see this home?
 *
 * Builder staff see homes their company built. Homeowners see homes they own
 * *or have owned* — a prior owner keeps read access to claims they filed, which
 * matters after a resale.
 */
export async function canAccessHome(
  user: SessionUser,
  homeId: string,
): Promise<boolean> {
  if (user.role === "homeowner") {
    const [ownership] = await db
      .select({ id: homeOwnerships.id })
      .from(homeOwnerships)
      .where(
        and(eq(homeOwnerships.homeId, homeId), eq(homeOwnerships.userId, user.id)),
      )
      .limit(1);
    return Boolean(ownership);
  }

  if (!user.builderId) return false;

  const [home] = await db
    .select({ id: homes.id })
    .from(homes)
    .where(and(eq(homes.id, homeId), eq(homes.builderId, user.builderId)))
    .limit(1);
  return Boolean(home);
}

/** Home ids a homeowner currently owns — the scope for their app. */
export async function currentHomeIdsFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ homeId: homeOwnerships.homeId })
    .from(homeOwnerships)
    .where(
      and(
        eq(homeOwnerships.userId, userId),
        or(isNull(homeOwnerships.endedAt), eq(homeOwnerships.endedAt, "9999-12-31")),
      ),
    );
  return rows.map((r) => r.homeId);
}
