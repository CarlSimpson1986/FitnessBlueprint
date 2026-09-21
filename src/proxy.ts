import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request (except static assets — see `matcher` below).
 *
 * Three jobs, all security-relevant:
 *  1. Route coach.fitnessblueprint.co.uk transparently to /admin/* — same
 *     Next.js app, same Vercel project, same env vars/auth/database as the
 *     member-facing domain. This is purely a URL/branding layer; RLS +
 *     role checks remain the actual security boundary (see CLAUDE.md's
 *     "Coach subdomain" note).
 *  2. Refresh the Supabase auth session so server components always see
 *     a valid (or correctly expired) user — this is what makes RLS work
 *     reliably rather than intermittently.
 *  3. Attach security headers to every response, including API routes.
 *
 * Named proxy.ts, not middleware.ts — the `middleware` file convention is
 * deprecated in this Next.js version, renamed to `proxy` (see
 * node_modules/next/dist/docs/.../proxy.md).
 *
 * Do not add page-specific logic here. Keep this file boring and global.
 */
export async function proxy(request: NextRequest) {
  const sessionResponse = await updateSession(request);

  const host = request.headers.get("host") ?? "";
  const isCoachHost = host.startsWith("coach.");
  const needsAdminRewrite =
    isCoachHost && !request.nextUrl.pathname.startsWith("/admin");

  let response = sessionResponse;

  if (needsAdminRewrite) {
    response = NextResponse.rewrite(
      new URL(`/admin${request.nextUrl.pathname}`, request.url)
    );
    // Carry the refreshed-session cookies onto the rewritten response —
    // the rewrite replaces sessionResponse rather than building on it.
    sessionResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
  }

  applySecurityHeaders(response);

  return response;
}

function applySecurityHeaders(response: NextResponse) {
  // Prevents the app being framed by another site (clickjacking).
  response.headers.set("X-Frame-Options", "DENY");

  // Stops the browser MIME-sniffing responses into something executable.
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Only send full referrer to our own origin; strip it for cross-origin links.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable browser features this app never needs. Add back individually
  // (not wholesale) if a real feature requires one of these.
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=(self)"
  );

  // Force HTTPS for a year, including subdomains, once first served over HTTPS.
  // Harmless in local dev — browsers ignore it over plain http://localhost.
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  // Content-Security-Policy — start restrictive, widen deliberately.
  // Add each external domain here as an integration is wired up
  // (Stripe.js, Firebase, Supabase storage, etc.) rather than using
  // wildcards. A CSP you had to loosen for a reason is safer than
  // one that was permissive from day one.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico, manifest.json, icons (PWA assets)
     * - any file with an extension (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
