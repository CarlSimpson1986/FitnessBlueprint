"use server";

import { requireCoachOrOwner } from "@/lib/auth";

export type ActionResult = { error?: string };

export async function createGymEvent(input: {
  title: string;
  eventDate: string;
  location: string;
  description: string;
  registrationUrl: string;
  isPaid: boolean;
}): Promise<ActionResult> {
  const { supabase, user } = await requireCoachOrOwner();

  const title = input.title.trim();
  if (!title) {
    return { error: "Give the event a title." };
  }

  // Relies on RLS ("coaches and owner post gym events") to enforce who can
  // write here — the RLS-respecting client, not the admin client, since
  // there's nothing to bypass.
  const { error } = await supabase.from("events").insert({
    title,
    description: input.description.trim() || null,
    event_type: "gym",
    event_date: input.eventDate || null,
    location: input.location.trim() || null,
    registration_url: input.registrationUrl.trim() || null,
    is_paid: input.isPaid,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
