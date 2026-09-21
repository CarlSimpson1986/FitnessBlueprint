import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes coach.fitnessblueprint.co.uk transparently to /admin/* — same
 * Next.js app, same Vercel project, same env vars/auth/database as the
 * member-facing domain. This is purely a URL/branding layer for Guy; RLS +
 * role checks remain the actual security boundary (see CLAUDE.md's
 * "Coach subdomain" note). Named proxy.ts, not middleware.ts — the
 * `middleware` file convention is deprecated in this Next.js version,
 * renamed to `proxy` (see node_modules/next/dist/docs/.../proxy.md).
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isCoachHost = host.startsWith("coach.");

  if (isCoachHost && !request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.rewrite(new URL(`/admin${request.nextUrl.pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
};
