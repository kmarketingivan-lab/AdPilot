import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/", "/auth/signin", "/setup"];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow API routes (auth, setup, webhooks, health, tracking)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Protect /dashboard/* routes — check for session token cookie
  if (pathname.startsWith("/dashboard")) {
    const token =
      req.cookies.get("__Secure-authjs.session-token") ??
      req.cookies.get("authjs.session-token") ??
      req.cookies.get("next-auth.session-token");

    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
