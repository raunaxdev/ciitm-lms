import { Role } from "@prisma/client";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const AUTH_COOKIE_NAME = "ciitm_session";
const tokenLifetimeSeconds = 60 * 60 * 24 * 7;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(profile: {
  id: string;
  email: string;
}): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({ email: profile.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profile.id)
    .setIssuedAt()
    .setExpirationTime(`${tokenLifetimeSeconds}s`)
    .sign(getJwtSecret());
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: tokenLifetimeSeconds,
  };
}

export async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  let subject: string;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string") return null;
    subject = payload.sub;
  } catch {
    return null;
  }

  return prisma.profile.findFirst({
    where: { id: subject, isActive: true },
    select: { id: true, name: true, email: true, role: true, rollNumber: true, department: true },
  });
}

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}
