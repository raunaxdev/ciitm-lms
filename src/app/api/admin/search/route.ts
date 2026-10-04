import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ profiles: [] });
  }

  const profiles = await prisma.profile.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { rollNumber: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNumber: true,
      department: true,
      isActive: true,
    },
    take: 10,
  });

  return NextResponse.json({ profiles });
}
