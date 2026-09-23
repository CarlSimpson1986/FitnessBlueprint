"use server";

import { requireOwner } from "@/lib/auth";
import type { ChallengeType } from "@/lib/challenges";

export type ActionResult = { error?: string };

export async function createChallenge(input: {
  title: string;
  description: string;
  type: ChallengeType;
  isOpen: boolean;
  targetValue: number;
  startsAt: string;
  endsAt: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireOwner();

  const title = input.title.trim();
  if (!title) {
    return { error: "Give the challenge a title." };
  }

  if (!Number.isInteger(input.targetValue) || input.targetValue <= 0) {
    return { error: "Target must be a positive whole number." };
  }

  if (!input.startsAt || !input.endsAt || input.endsAt < input.startsAt) {
    return { error: "End date must be on or after the start date." };
  }

  // Relies on RLS ("coaches and owner manage challenges") — the
  // RLS-respecting client, not the admin client, since there's nothing to
  // bypass.
  const { error } = await supabase.from("challenges").insert({
    title,
    description: input.description.trim() || null,
    type: input.type,
    is_open: input.isOpen,
    target_value: input.targetValue,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
