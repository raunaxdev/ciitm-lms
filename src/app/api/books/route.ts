import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/auth";
import { internalServerError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const newBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(160),
  isbn: z.string().trim().min(10).max(17),
  category: z.string().trim().min(1).max(100),
  publisher: z.string().trim().max(160).optional(),
  publishedYear: z.number().int().min(1000).max(new Date().getFullYear()).optional(),
  totalCopies: z.number().int().min(1).max(100_000),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const category = searchParams.get("category") ?? "";
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const requestedPageSize = Number(searchParams.get("pageSize") ?? "10");
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(1, Math.floor(requestedPageSize)), 50)
      : 10;
    const isSemanticSearch = searchParams.get("semantic") === "true";

    const where: Prisma.BookWhereInput = {};
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      const searchTerms = Array.from(
        new Set(
          trimmedSearch
            .toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((term) => term.length > 1),
        ),
      );

      const searchPredicate = (term: string): Prisma.BookWhereInput[] => [
        { title: { contains: term, mode: "insensitive" as const } },
        { author: { contains: term, mode: "insensitive" as const } },
        { isbn: { contains: term, mode: "insensitive" as const } },
        { category: { contains: term, mode: "insensitive" as const } },
      ];

      const semanticOrConditions = searchTerms.flatMap((term) => searchPredicate(term));

      where.OR = isSemanticSearch
        ? semanticOrConditions.length > 0
          ? semanticOrConditions
          : searchPredicate(trimmedSearch)
        : searchPredicate(trimmedSearch);
    }

    if (category.trim()) {
      where.category = { contains: category.trim(), mode: "insensitive" };
    }

    const [books, totalTitles, copyTotals] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy: { title: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          author: true,
          isbn: true,
          category: true,
          publisher: true,
          publishedYear: true,
          totalCopies: true,
          availableCopies: true,
        },
      }),
      prisma.book.count({ where }),
      prisma.book.aggregate({
        where,
        _sum: { totalCopies: true, availableCopies: true },
      }),
    ]);

    const totalCopies = copyTotals._sum.totalCopies ?? 0;
    const availableCopies = copyTotals._sum.availableCopies ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalTitles / pageSize));

    return NextResponse.json({
      books,
      metrics: {
        totalTitles,
        totalCopies,
        availableCopies,
        checkedOutCopies: totalCopies - availableCopies,
      },
      pagination: {
        page,
        pageSize,
        totalPages,
        total: totalTitles,
      },
    });
  } catch (error) {
    return internalServerError(error, "GET /api/books");
  }
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    return internalServerError(error, "POST /api/books authentication");
  }
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = newBookSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid book details.", details: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const book = await prisma.book.create({
      data: {
        ...result.data,
        availableCopies: result.data.totalCopies,
      },
    });
    return NextResponse.json({ book }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "A book with this ISBN already exists." }, { status: 409 });
    }
    return internalServerError(error, "POST /api/books");
  }
}
