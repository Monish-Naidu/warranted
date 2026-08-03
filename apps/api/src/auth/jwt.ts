import type { Role, SessionUser } from "@warranted/shared";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "warranted";
const TOKEN_TTL = "7d";

export interface TokenClaims {
  sub: string;
  email: string;
  fullName: string;
  role: Role;
  builderId: string | null;
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    builderId: user.builderId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    if (!payload.sub) return null;

    return {
      id: payload.sub,
      email: String(payload.email),
      fullName: String(payload.fullName),
      role: payload.role as Role,
      builderId: (payload.builderId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
