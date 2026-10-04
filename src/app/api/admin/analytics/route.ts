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

  const now = new Date();

  const [transactions, departmentProfiles, overdueUsers, totalIssued] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: { in: ["ISSUED", "OVERDUE", "RETURNED"] } },
      select: {
        bookId: true,
        book: { select: { title: true, author: true, category: true } },
      },
    }),
    prisma.profile.findMany({
      where: { role: "USER", department: { not: null } },
      select: { department: true },
    }),
    prisma.profile.findMany({
      where: {
        transactions: {
          some: {
            status: { in: ["ISSUED", "OVERDUE"] },
            dueAt: { lt: now },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        rollNumber: true,
        department: true,
        transactions: {
          where: {
            status: { in: ["ISSUED", "OVERDUE"] },
            dueAt: { lt: now },
          },
          select: { dueAt: true, fineAmount: true },
        },
      },
      take: 10,
    }),
    prisma.transaction.count({ where: { status: { in: ["ISSUED", "OVERDUE", "RETURNED"] } } }),
  ]);

  const topBooksMap = new Map<string, { title: string; author: string; category: string; count: number }>();
  for (const transaction of transactions) {
    const key = transaction.bookId;
    const existing = topBooksMap.get(key) ?? {
      title: transaction.book?.title ?? "Unknown",
      author: transaction.book?.author ?? "Unknown",
      category: transaction.book?.category ?? "Uncategorized",
      count: 0,
    };
    existing.count += 1;
    topBooksMap.set(key, existing);
  }

  const deptCounts = new Map<string, number>();
  for (const profile of departmentProfiles) {
    const department = profile.department ?? "General";
    deptCounts.set(department, (deptCounts.get(department) ?? 0) + 1);
  }

  const enrichedTopBooks = [...topBooksMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const departmentUsage = [...deptCounts.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return NextResponse.json({
    summary: {
      totalIssued: totalIssued,
      topBooks: enrichedTopBooks,
      departmentUsage,
      overdueUsers: overdueUsers.map((profile) => ({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        rollNumber: profile.rollNumber,
        department: profile.department ?? "General",
        overdueItems: profile.transactions.length,
        totalFine: profile.transactions.reduce((sum, transaction) => sum + Number(transaction.fineAmount ?? 0), 0),
      })),
    },
  });
}
