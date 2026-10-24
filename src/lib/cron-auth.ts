import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * True if the request's Authorization header is exactly "Bearer <secret>".
 * Constant-time, so the comparison can't leak the secret a character at a
 * time. Shared by the cron jobs and the waitlist-offer database webhook,
 * which all use CRON_SECRET.
 */
export function isAuthorisedBearer(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
