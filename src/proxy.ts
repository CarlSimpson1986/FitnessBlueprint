import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { publicEnv, serverEnv } from "@/lib/env";
import { OWNER_RETURN_COOKIE } from "@/lib/test-accounts";

/**
 * Runs on every request (except static assets — see `matcher` below).
 *
 * Four jobs, all security-relevant:
 *  0. Redirect stray production aliases to the one canonical host (see
 *     the comment inline — it's what keeps magic links working).
 *  1. Route coach.fitnessblueprint.co.uk transparently to /admin/* — same
 *     Next.js app, same Vercel project, same env vars/auth/database as the
 *     member-facing domain. This is purely a URL/branding layer; RLS +
 *     role checks remain the actual security boundary (see CLAUDE.md's
 *     "Coach subdomain" note).
 *  2. Refresh the Supabase auth session so server components always see
 *     a valid (or correctly expired) user — this is what makes RLS work
 *     reliably rather than intermittently.
 *  3. Attach security headers to every response, including API routes,
 *     with a fresh CSP nonce per request so only Next.js's own scripts run.
 *  4. While the owner is in "view as" (signed into a test account), send
 *     top-level page loads to /view-as so the app shows inside the phone
 *     frame. Requests from inside that frame (Sec-Fetch-Dest: iframe) and
 *     client-side fetches pass through untouched.
 *
 * Named proxy.ts, not middleware.ts — the `middleware` file convention is
 * deprecated in this Next.js version, renamed to `proxy` (see
 * node_modules/next/dist/docs/.../proxy.md).
 *
 * Do not add page-specific logic here. Keep this file boring and global.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isCoachHost = host.startsWith("coach.");

  // Production is reachable on several *.vercel.app aliases, but magic
  // links always come back to NEXT_PUBLIC_SITE_URL. Supabase's PKCE code
  // verifier cookie is per-host, so requesting a link on one alias and
  // landing on another fails the code exchange and bounces to /login.
  // Keep everyone on the one canonical host so that can't happen.
  // /api/* is exempt: Vercel Cron calls the deployment's own URL and
  // doesn't follow redirects, so redirecting it meant the daily cron
  // got a 308 and never ran (2026-09-23 to 2026-10-01). Webhooks and
  // calendar feeds are server-to-server too — no browser cookies involved.
  const canonicalHost = new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host;
  if (
    serverEnv().VERCEL_ENV === "production" &&
    !isCoachHost &&
    host !== canonicalHost &&
    !request.nextUrl.pathname.startsWith("/api/")
  ) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, publicEnv.NEXT_PUBLIC_SITE_URL);
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;
  if (
    request.cookies.has(OWNER_RETURN_COOKIE) &&
    request.headers.get("sec-fetch-dest") === "document" &&
    !pathname.startsWith("/view-as") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/api")
  ) {
    const url = new URL("/view-as", request.url);
    url.searchParams.set("path", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Next.js reads the nonce from the request's CSP header while rendering
  // and puts it on its own scripts (node_modules/next/dist/docs/01-app/
  // 02-guides/content-security-policy.md). Needs every page rendered per
  // request — the root layout calls connection() for that.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const sessionResponse = await updateSession(request, requestHeaders);
  const needsAdminRewrite =
    isCoachHost && !request.nextUrl.pathname.startsWith("/admin");

  let response = sessionResponse;

  if (needsAdminRewrite) {
    response = NextResponse.rewrite(
      new URL(`/admin${request.nextUrl.pathname}`, request.url),
      { request: { headers: requestHeaders } }
    );
    // Carry the refreshed-session cookies onto the rewritten response —
    // the rewrite replaces sessionResponse rather than building on it.
    sessionResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
  }

  applySecurityHeaders(response, csp);

  return response;
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  // Prevents the app being framed by another site (clickjacking). Same-
  // origin framing is allowed only for /view-as's phone preview.
  response.headers.set("X-Frame-Options", "SAMEORIGIN");

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

  response.headers.set("Content-Security-Policy", csp);
}

// Content-Security-Policy — start restrictive, widen deliberately.
// Add each external domain here as an integration is wired up
// (Stripe.js, Firebase, Supabase storage, etc.) rather than using
// wildcards. A CSP you had to loosen for a reason is safer than
// one that was permissive from day one.
//
// Scripts: only ones carrying this request's nonce, plus what they load
// ('strict-dynamic'). That replaced 'unsafe-inline' (security audit
// 2026-10-24) — an injected <script> can't guess the nonce. 'self' and
// js.stripe.com are fallbacks for browsers without 'strict-dynamic'.
// Dev needs 'unsafe-eval' for React's error stacks; production doesn't.
// Styles keep 'unsafe-inline': React style={…} attributes can't carry a
// nonce, and style injection can't run code.
function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    // api.pwnedpasswords.com: the leaked-password check on the password
    // forms (src/lib/pwned-password.ts) — only a 5-character hash prefix is sent.
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.pwnedpasswords.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
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
