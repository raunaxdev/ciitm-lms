import PDFDocument from "pdfkit";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { transactionId } = await context.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      profile: { select: { id: true, name: true, email: true, rollNumber: true, department: true } },
      book: { select: { id: true, title: true, author: true, category: true, isbn: true } },
    },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  if (user.role !== "ADMIN" && transaction.profileId !== user.id) {
    return NextResponse.json({ error: "You can only download receipts for your own transactions." }, { status: 403 });
  }

  const fineAmount = Number(transaction.fineAmount ?? 0);
  const issueDate = transaction.issuedAt ? transaction.issuedAt.toLocaleDateString("en-IN") : "—";
  const returnDate = transaction.returnedAt ? transaction.returnedAt.toLocaleDateString("en-IN") : "—";
  const dueDate = transaction.dueAt ? transaction.dueAt.toLocaleDateString("en-IN") : "—";

  const pdf = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];

  pdf.on("data", (chunk: Buffer) => {
    chunks.push(Buffer.from(chunk));
  });

  await new Promise<void>((resolve, reject) => {
    pdf.on("end", () => resolve());
    pdf.on("error", (error: Error) => reject(error));

    pdf.fillColor("#0f172a").fontSize(26).text("CIITM Library Management System", { align: "center" });
    pdf.moveDown(0.5);
    pdf.fillColor("#334155").fontSize(12).text("Academic Excellence through Efficient Circulation", { align: "center" });
    pdf.moveDown(1.3);

    pdf.fillColor("#0f172a").fontSize(18).text("Fine Receipt");
    pdf.moveDown(0.8);
    pdf.fontSize(11).fillColor("#475569");
    pdf.text(`Transaction ID: ${transaction.id}`);
    pdf.text(`Student: ${transaction.profile?.name ?? "Unknown student"}`);
    pdf.text(`Email: ${transaction.profile?.email ?? "—"}`);
    pdf.text(`Roll Number: ${transaction.profile?.rollNumber ?? "—"}`);
    pdf.text(`Department: ${transaction.profile?.department ?? "General"}`);
    pdf.text(`Book: ${transaction.book?.title ?? "Unknown title"}`);
    pdf.text(`ISBN: ${transaction.book?.isbn ?? "—"}`);
    pdf.text(`Issue Date: ${issueDate}`);
    pdf.text(`Due Date: ${dueDate}`);
    pdf.text(`Return Date: ${returnDate}`);
    pdf.moveDown(1.2);

    pdf.fillColor("#0f172a").fontSize(14).text("Fine Breakdown");
    pdf.moveDown(0.4);
    pdf.rect(60, pdf.y, 490, 90).fillAndStroke("#f8fafc", "#cbd5e1");
    pdf.fillColor("#0f172a").fontSize(11);
    pdf.text("Overdue charges", 80, pdf.y + 20, { continued: true });
    pdf.text(`₹${fineAmount.toFixed(2)}`, { align: "right" });
    pdf.moveDown(0.7);
    pdf.text("Status", 80, pdf.y + 20, { continued: true });
    pdf.text(`${transaction.status}`, { align: "right" });
    pdf.moveDown(0.7);
    pdf.text("Authorized by", 80, pdf.y + 20, { continued: true });
    pdf.text("CIITM Library Desk", { align: "right" });
    pdf.moveDown(1.5);

    pdf.fillColor("#0f172a").fontSize(14).text("Total Amount Due");
    pdf.fontSize(20).text(`₹${fineAmount.toFixed(2)}`, { align: "right" });
    pdf.moveDown(0.8);
    pdf.fillColor("#475569").fontSize(10).text(`Generated on ${new Date().toLocaleString("en-IN")}`);
    pdf.text("This receipt confirms the fine settlement for the referenced library transaction.");

    pdf.end();
  });

  const buffer = Buffer.concat(chunks);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ciitm-receipt-${transaction.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
