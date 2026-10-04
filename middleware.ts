import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const user = await getAuthenticatedUser(request);

  if (!user) {
    const loginUrl = new URL("/admin", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/student", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-ciitm-user", user.id);
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
