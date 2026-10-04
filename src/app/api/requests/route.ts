import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDueDateFromNow } from "@/lib/transactions";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    bookId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("approve"),
    requestId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("reject"),
    requestId: z.string().trim().min(1),
    notes: z.string().trim().max(240).optional(),
  }),
]);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const requests = await prisma.bookRequest.findMany({
    where: user.role === "ADMIN" ? {} : { profileId: user.id },
    include: {
      book: { select: { id: true, title: true, author: true, isbn: true, category: true, availableCopies: true } },
      profile: { select: { id: true, name: true, email: true, rollNumber: true, department: true, role: true } },
    },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = requestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid request.", details: result.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = result.data;

  if (input.action === "request") {
    const book = await prisma.book.findUnique({ where: { id: input.bookId } });
    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const existing = await prisma.bookRequest.findFirst({
      where: { profileId: user.id, bookId: book.id, status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have a pending request for this book." }, { status: 409 });
    }

    const created = await prisma.bookRequest.create({
      data: { profileId: user.id, bookId: book.id, status: "PENDING" },
      include: { book: true, profile: true },
    });

    return NextResponse.json({ request: created, message: "Book request submitted successfully." }, { status: 201 });
  }

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const requestEntry = await prisma.bookRequest.findUnique({
    where: { id: input.requestId },
    include: { profile: true, book: true },
  });

  if (!requestEntry) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (input.action === "approve") {
    if (requestEntry.book.availableCopies < 1) {
      return NextResponse.json({ error: "No copies are available for approval." }, { status: 409 });
    }

    const dueAt = getDueDateFromNow();
    const updated = await prisma.$transaction(async (tx) => {
      const approved = await tx.bookRequest.update({
        where: { id: requestEntry.id },
        data: { status: "APPROVED", approvedAt: new Date() },
      });

      const transaction = await tx.transaction.create({
        data: {
          profileId: requestEntry.profileId,
          bookId: requestEntry.bookId,
          requestId: approved.id,
          status: "ISSUED",
          dueAt,
          fineAmount: 0,
        },
      });

      await tx.book.update({
        where: { id: requestEntry.bookId },
        data: { availableCopies: { decrement: 1 } },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "APPROVE_BOOK_REQUEST",
          entity: "BookRequest",
          entityId: approved.id,
          metadata: {
            studentId: requestEntry.profileId,
            bookId: requestEntry.bookId,
            dueAt: dueAt.toISOString(),
            transactionId: transaction.id,
          },
        },
      });

      return { approved, transaction };
    });

    return NextResponse.json({ request: updated.approved, transaction: updated.transaction, message: "Book request approved and issued." });
  }

  const updated = await prisma.bookRequest.update({
    where: { id: requestEntry.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      notes: input.notes ?? "Rejected by administrator.",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "REJECT_BOOK_REQUEST",
      entity: "BookRequest",
      entityId: updated.id,
      metadata: { studentId: requestEntry.profileId, bookId: requestEntry.bookId, reason: input.notes ?? "Rejected by administrator." },
    },
  });

  return NextResponse.json({ request: updated, message: "Book request rejected." });
}
