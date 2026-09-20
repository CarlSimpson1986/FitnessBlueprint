"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

/**
 * event_interests has no delete/update policy (0002) — expressing interest
 * is one-way, matching challenge_participants' same append-only shape.
 * unique(event_id, member_id) makes a duplicate click harmless.
 */
export async function expressInterest(eventId: string): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const { error } = await supabase
    .from("event_interests")
    .insert({ event_id: eventId, member_id: user.id });

  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  return {};
}

export async function postMemberEvent(input: {
  title: string;
  eventDate: string;
  location: string;
  description: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const title = input.title.trim();
  if (!title) {
    return { error: "Give your event a title." };
  }

  const { error } = await supabase.from("events").insert({
    title,
    description: input.description.trim() || null,
    event_type: "member_posted",
    event_date: input.eventDate || null,
    location: input.location.trim() || null,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
