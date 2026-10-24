/**
 * Leaked-password check for the set/change password forms (2026-10-24).
 * Supabase's own HaveIBeenPwned check needs the Pro plan, so the app does
 * the same thing in the browser with HIBP's k-anonymity API: the password
 * is SHA-1 hashed locally and only the first 5 hex characters of the hash
 * are sent; the matching suffixes come back and are compared here. The
 * password itself never leaves the device.
 *
 * Fails open: if HIBP can't be reached, the password is allowed rather
 * than locking someone out of setting one. Needs api.pwnedpasswords.com
 * in the CSP's connect-src (src/proxy.ts).
 */

export const MIN_PASSWORD_LENGTH = 10;

/** How many times this password appears in known breaches (0 = not found, or HIBP unreachable). */
export async function pwnedCount(password: string): Promise<number> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // Add-Padding: the response size doesn't hint at which prefix was asked for.
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return 0;

    for (const line of (await res.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** The error to show for a new password, or null if it's fine. */
export async function newPasswordProblem(password: string, confirmPassword: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) {
    return "Passwords don't match.";
  }
  if ((await pwnedCount(password)) > 0) {
    return "That password has appeared in a known data breach, so it's easy to guess. Please choose a different one.";
  }
  return null;
}
