"use server";

import { requireOwner } from "@/lib/auth";
import { buildWeeklySummary, type WeeklySummary } from "@/lib/coach-ted/weekly-summary";

/** On-demand version of the Monday summary email, on the owner's RLS client. */
export async function summariseLastWeek(): Promise<WeeklySummary | { status: "error"; error: string }> {
  const { supabase } = await requireOwner();
  try {
    return await buildWeeklySummary(supabase);
  } catch (err) {
    console.error("summariseLastWeek failed:", err);
    return { status: "error", error: "Ted couldn't write the summary just now. Try again in a minute." };
  }
}
