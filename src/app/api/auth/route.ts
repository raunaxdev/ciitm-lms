import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getAuthenticatedUser,
  getSessionCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(72, "Password must be no more than 72 characters.")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes.",
  });

const loginPasswordSchema = z
  .string()
  .min(1)
  .max(72)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes.",
  });

const authRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: passwordSchema,
    rollNumber: z.string().trim().min(3).max(32).optional(),
    department: z.string().trim().min(2).max(80).optional(),
  }),
  z.object({
    action: z.literal("login"),
    email: z.string().trim().email().max(254),
    password: loginPasswordSchema,
  }),
  z.object({ action: z.literal("logout") }),
]);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = authRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = result.data;
  if (input.action === "logout") {
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, "", { ...getSessionCookieOptions(), maxAge: 0 });
    return response;
  }

  const email = input.email.toLowerCase();
  let profile;

  if (input.action === "register") {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const rollNumber = input.rollNumber?.trim() || null;
    const department = input.department?.trim() || "General";

    try {
      profile = await prisma.profile.create({
        data: {
          name: input.name,
          email,
          passwordHash,
          role: "USER",
          rollNumber,
          department,
        },
        select: { id: true, name: true, email: true, role: true, rollNumber: true, department: true },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const target = (error as { meta?: { target?: string[] } }).meta?.target ?? [];
        if (target.includes("rollNumber")) {
          return NextResponse.json({ error: "A student with this roll number already exists." }, { status: 409 });
        }
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      throw error;
    }
  } else {
    const existing = await prisma.profile.findUnique({ where: { email } });
    const passwordMatches =
      existing?.isActive === true &&
      (await bcrypt.compare(input.password, existing.passwordHash));
    if (!existing || !passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    profile = {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      role: existing.role,
      rollNumber: existing.rollNumber,
      department: existing.department,
    };
  }

  const token = await createSessionToken(profile);
  const response = NextResponse.json({ user: profile });
  response.cookies.set(AUTH_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}
