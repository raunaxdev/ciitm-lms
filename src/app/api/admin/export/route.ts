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

  const type = new URL(request.url).searchParams.get("type") ?? "inventory";
  const format = new URL(request.url).searchParams.get("format") ?? "csv";

  if (type === "inventory") {
    const books = await prisma.book.findMany({ orderBy: { title: "asc" } });
    const rows = [
      ["Title", "Author", "ISBN", "Category", "Publisher", "Published Year", "Total Copies", "Available Copies"],
      ...books.map((book) => [
        book.title,
        book.author,
        book.isbn,
        book.category,
        book.publisher ?? "",
        book.publishedYear ?? "",
        String(book.totalCopies),
        String(book.availableCopies),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(format === "xls" ? csv : csv, {
      headers: {
        "Content-Type": format === "xls" ? "application/vnd.ms-excel" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ciitm-inventory-${Date.now()}.${format === "xls" ? "xls" : "csv"}"`,
      },
    });
  }

  const transactions = await prisma.transaction.findMany({
    include: { profile: true, book: true },
    orderBy: { issuedAt: "desc" },
  });

  const rows = [
    ["Student", "Roll Number", "Department", "Book", "ISBN", "Issued At", "Due At", "Returned At", "Status", "Fine Amount"],
    ...transactions.map((transaction) => [
      transaction.profile.name,
      transaction.profile.rollNumber ?? "",
      transaction.profile.department ?? "",
      transaction.book.title,
      transaction.book.isbn,
      new Date(transaction.issuedAt).toISOString(),
      new Date(transaction.dueAt).toISOString(),
      transaction.returnedAt ? new Date(transaction.returnedAt).toISOString() : "",
      transaction.status,
      String(Number(transaction.fineAmount ?? 0)),
    ]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  return new NextResponse(format === "xls" ? csv : csv, {
    headers: {
      "Content-Type": format === "xls" ? "application/vnd.ms-excel" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ciitm-fines-${Date.now()}.${format === "xls" ? "xls" : "csv"}"`,
    },
  });
}
