import { Prisma, TransactionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateFineAmount, getDueDateFromNow } from "@/lib/transactions";

export const runtime = "nodejs";

const issueSchema = z.object({
  action: z.literal("issue"),
  bookId: z.string().trim().min(1),
  profileId: z.string().trim().optional(),
});

const returnSchema = z.object({
  action: z.literal("return"),
  bookId: z.string().trim().min(1),
  transactionId: z.string().trim().min(1).optional(),
  profileId: z.string().trim().optional(),
});

const transactionRequestSchema = z.discriminatedUnion("action", [issueSchema, returnSchema]);

function serializeTransaction(transaction: {
  id: string;
  profileId: string;
  bookId: string;
  status: TransactionStatus;
  issuedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  fineAmount: Prisma.Decimal | number;
  createdAt: Date;
  updatedAt: Date;
  profile?: { id: string; name: string; email: string; role: "ADMIN" | "STAFF" | "USER" };
  book?: { id: string; title: string; author: string; isbn: string; category: string };
}) {
  return {
    ...transaction,
    fineAmount: Number(transaction.fineAmount ?? 0),
    issuedAt: transaction.issuedAt.toISOString(),
    dueAt: transaction.dueAt.toISOString(),
    returnedAt: transaction.returnedAt ? transaction.returnedAt.toISOString() : null,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    profile: transaction.profile ?? null,
    book: transaction.book ?? null,
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedProfileId = searchParams.get("profileId") ?? undefined;
  const targetProfileId = user.role === "ADMIN" && requestedProfileId ? requestedProfileId : user.id;

  const where: Prisma.TransactionWhereInput = {
    profileId: targetProfileId,
  };

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      profile: { select: { id: true, name: true, email: true, role: true } },
      book: { select: { id: true, title: true, author: true, isbn: true, category: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  return NextResponse.json({
    transactions: transactions.map(serializeTransaction),
    profile: user,
    adminView: user.role === "ADMIN" && requestedProfileId !== undefined,
  });
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

  const result = transactionRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid transaction request.", details: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = result.data;
  if (input.action === "issue") {
    const selectorProfileId = input.profileId ?? user.id;
    if (user.role !== "ADMIN" && selectorProfileId !== user.id) {
      return NextResponse.json({ error: "You can only issue books for your own account." }, { status: 403 });
    }

    const profile = await prisma.profile.findUnique({ where: { id: selectorProfileId } });
    if (!profile || !profile.isActive) {
      return NextResponse.json({ error: "Account not found or inactive." }, { status: 404 });
    }

    const book = await prisma.book.findUnique({ where: { id: input.bookId } });
    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const existingLoan = await prisma.transaction.findFirst({
      where: {
        profileId: profile.id,
        bookId: book.id,
        status: { in: [TransactionStatus.ISSUED, TransactionStatus.OVERDUE] },
      },
    });

    if (existingLoan) {
      return NextResponse.json({ error: "This book is already issued to this profile." }, { status: 409 });
    }

    if (book.availableCopies < 1) {
      return NextResponse.json({ error: "No copies are available for this book right now." }, { status: 409 });
    }

    const dueAt = getDueDateFromNow();

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedBook = await tx.book.update({
        where: { id: book.id },
        data: { availableCopies: { decrement: 1 } },
      });

      const created = await tx.transaction.create({
        data: {
          profileId: profile.id,
          bookId: updatedBook.id,
          status: TransactionStatus.ISSUED,
          dueAt,
          fineAmount: 0,
        },
      });

      return { transaction: created, book: updatedBook };
    });

    return NextResponse.json({
      message: "Book issued successfully.",
      transaction: serializeTransaction({
        ...transaction.transaction,
        profile: { id: profile.id, name: profile.name, email: profile.email, role: profile.role },
        book: {
          id: book.id,
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          category: book.category,
        },
      }),
    });
  }

  const selectorProfileId = input.profileId ?? user.id;
  if (user.role !== "ADMIN" && selectorProfileId !== user.id) {
    return NextResponse.json({ error: "You can only return books issued to your own account." }, { status: 403 });
  }

  const activeTransaction = await prisma.transaction.findFirst({
    where: {
      id: input.transactionId ?? undefined,
      profileId: selectorProfileId,
      bookId: input.bookId,
      status: { in: [TransactionStatus.ISSUED, TransactionStatus.OVERDUE] },
    },
    include: {
      profile: { select: { id: true, name: true, email: true, role: true } },
      book: { select: { id: true, title: true, author: true, isbn: true, category: true } },
    },
  });

  if (!activeTransaction) {
    return NextResponse.json({ error: "No active issue found for this book." }, { status: 404 });
  }

  const returnedAt = new Date();
  const fineAmount = calculateFineAmount(activeTransaction.dueAt, returnedAt);
  const nextStatus = fineAmount > 0 ? TransactionStatus.OVERDUE : TransactionStatus.RETURNED;

  const payment = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id: activeTransaction.id },
      data: {
        status: nextStatus,
        returnedAt,
        fineAmount,
      },
    });

    await tx.book.update({
      where: { id: activeTransaction.bookId },
      data: { availableCopies: { increment: 1 } },
    });

    return updated;
  });

  return NextResponse.json({
    message: "Book returned successfully.",
    transaction: serializeTransaction({
      ...payment,
      profile: activeTransaction.profile,
      book: activeTransaction.book,
    }),
  });
}
