import { NextResponse } from "next/server";

export function internalServerError(error: unknown, context: string) {
  console.error(`[${context}]`, error);
  return NextResponse.json(
    { error: "An unexpected server error occurred.", code: "INTERNAL_SERVER_ERROR" },
    { status: 500 },
  );
}
