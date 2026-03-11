import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isSelfHosted =
  !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Self-hosted: no auth required, redirect landing to dashboard
  if (isSelfHosted) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // --- SaaS mode: normal auth flow ---
  const publicRoutes = ["/", "/auth/signin", "/setup"];

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

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
