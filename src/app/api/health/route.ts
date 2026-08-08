import { NextResponse } from "next/server";

/**
 * Minimal uptime check. Deliberately returns nothing about the database,
 * environment, or dependency versions — a health check endpoint is
 * public by nature, so it shouldn't leak anything useful to an attacker
 * doing reconnaissance.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
