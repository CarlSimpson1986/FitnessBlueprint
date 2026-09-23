"use server";

import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeDemoData, seedDemoData } from "@/lib/demo-data";

export type ActionResult = { error?: string };

// Owner-only. See src/lib/demo-data.ts for why this needs the admin client.
export async function loadDemoData(): Promise<ActionResult> {
  await requireOwner();
  return seedDemoData(createAdminClient());
}

export async function clearDemoData(): Promise<ActionResult> {
  await requireOwner();
  return removeDemoData(createAdminClient());
}
