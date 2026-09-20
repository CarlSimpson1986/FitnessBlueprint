"use server";

import { randomUUID } from "crypto";
import { requireCoachOrOwner } from "@/lib/auth";
import { parseBlockText } from "@/lib/session-plans";

export type BulkUploadResult = {
  error?: string;
  publishedCount?: number;
  skippedDates?: string[];
};

/**
 * Relies on RLS ("coaches and owner manage plans", 0002) — the
 * RLS-respecting client, not the admin client, since there's nothing to
 * bypass. Sets is_published = true immediately: the coach uploading the
 * whole block IS the publish decision, per the owner's ask for
 * day-by-day auto-publish without one-at-a-time entry. This app only
 * ever *displays* a plan for a session happening today (see the
 * homepage), not future days — but a member hitting the REST API
 * directly could technically read a future day's plan early, since RLS
 * doesn't do date-gating. Accepted for v1: plan text isn't sensitive
 * data, unlike profiles/session_feedback where the same class of gap
 * was worth closing properly.
 */
export async function bulkUploadSessionPlans(input: {
  templateId: string;
  blockText: string;
}): Promise<BulkUploadResult> {
  const { supabase, user } = await requireCoachOrOwner();

  const blocks = parseBlockText(input.blockText);
  if (blocks.length === 0) {
    return {
      error: "Couldn't find any dated sections — start each day with a line like 2026-09-22.",
    };
  }

  const dates = blocks.map((b) => b.date);
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, session_date")
    .eq("template_id", input.templateId)
    .eq("status", "scheduled")
    .in("session_date", dates);

  if (error) {
    return { error: error.message };
  }

  const sessionIdsByDate = new Map<string, string[]>();
  for (const s of sessions ?? []) {
    const list = sessionIdsByDate.get(s.session_date) ?? [];
    list.push(s.id);
    sessionIdsByDate.set(s.session_date, list);
  }

  const blockId = randomUUID();
  const rows: {
    session_id: string;
    block_id: string;
    plan_text: string;
    is_published: boolean;
    created_by: string;
  }[] = [];
  const skippedDates: string[] = [];

  for (const block of blocks) {
    const sessionIds = sessionIdsByDate.get(block.date) ?? [];
    if (sessionIds.length === 0) {
      skippedDates.push(block.date);
      continue;
    }
    for (const sessionId of sessionIds) {
      rows.push({
        session_id: sessionId,
        block_id: blockId,
        plan_text: block.planText,
        is_published: true,
        created_by: user.id,
      });
    }
  }

  if (rows.length === 0) {
    return {
      error: "None of those dates have a scheduled session of this type yet.",
      skippedDates,
    };
  }

  const { error: upsertError } = await supabase
    .from("session_plans")
    .upsert(rows, { onConflict: "session_id" });

  if (upsertError) {
    return { error: upsertError.message };
  }

  return {
    publishedCount: rows.length,
    skippedDates: skippedDates.length ? skippedDates : undefined,
  };
}
