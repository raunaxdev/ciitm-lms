import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const ocrSchema = z.object({
  isbn: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  coverImageDataUrl: z.string().trim().optional(),
});

function normalizeIsbn(rawValue?: string): string | null {
  if (!rawValue) {
    return null;
  }

  const cleaned = rawValue.replace(/[^0-9Xx]/g, "");
  if (!cleaned) {
    return null;
  }

  if (cleaned.length === 13 || cleaned.length === 10) {
    return cleaned.toUpperCase();
  }

  const isbnCandidate = cleaned.replace(/\D/g, "");
  if (isbnCandidate.length >= 10 && isbnCandidate.length <= 13) {
    return isbnCandidate;
  }

  return null;
}

function extractIsbnFromText(input?: string) {
  if (!input) {
    return null;
  }

  const matches = input.match(/97[0-9][0-9Xx\- ]{10,17}/g) ?? [];
  if (matches.length === 0) {
    return null;
  }

  return normalizeIsbn(matches[0]);
}

async function lookupOpenLibraryMetadata(isbn: string) {
  const urls = [
    `https://openlibrary.org/search.json?q=isbn:${encodeURIComponent(isbn)}`,
    `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        docs?: Array<{
          title?: string;
          author_name?: string[];
          subject?: string[];
          publisher?: string[];
          isbn?: string[];
          first_publish_year?: number;
        }>;
        title?: string;
        authors?: Array<{ name?: string }>;
        publishers?: string[];
        publish_date?: string;
        covers?: number[];
      };

      const doc = payload.docs?.[0];
      if (doc) {
        return {
          title: doc.title ?? "Unknown title",
          author: doc.author_name?.[0] ?? "Unknown author",
          category: doc.subject?.[0] ?? "General",
          isbn,
          publisher: doc.publisher?.[0] ?? undefined,
          publishedYear: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        };
      }

      if (payload.title || payload.authors || payload.publishers) {
        return {
          title: payload.title ?? "Unknown title",
          author: payload.authors?.[0]?.name ?? "Unknown author",
          category: "General",
          isbn,
          publisher: payload.publishers?.[0],
          publishedYear: payload.publish_date ? payload.publish_date.slice(0, 4) : undefined,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = ocrSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid OCR payload." }, { status: 400 });
  }

  const input = result.data;
  const isbnFromPayload = normalizeIsbn(input.isbn) ?? extractIsbnFromText(input.fileName) ?? extractIsbnFromText(input.coverImageDataUrl);

  if (!isbnFromPayload) {
    return NextResponse.json({ error: "No readable ISBN found in the scanned input or uploaded cover image." }, { status: 400 });
  }

  const metadata = await lookupOpenLibraryMetadata(isbnFromPayload);

  if (!metadata) {
    return NextResponse.json({
      book: {
        title: "Unrecognized title",
        author: "Unknown author",
        category: "General",
        isbn: isbnFromPayload,
        publisher: undefined,
        publishedYear: undefined,
      },
    });
  }

  return NextResponse.json({
    book: {
      ...metadata,
      isbn: isbnFromPayload,
    },
  });
}
