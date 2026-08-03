import { zValidator } from "@hono/zod-validator";
import { loginSchema, type SessionUser } from "@warranted/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { signToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/password.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  // Verify against a dummy hash when the user is absent so the response time
  // doesn't reveal which emails are registered.
  const stored = user?.passwordHash ?? "scrypt$131072$8$1$00$00";
  const valid = await verifyPassword(password, stored);

  if (!user || !valid) {
    return c.json(
      {
        error: {
          code: "invalid_credentials",
          message: "That email and password combination isn't right.",
        },
      },
      401,
    );
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    builderId: user.builderId,
  };

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return c.json({ token: await signToken(sessionUser), user: sessionUser });
});

authRoutes.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }));
