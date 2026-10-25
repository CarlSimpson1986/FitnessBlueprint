"use server";

import { requireOwner } from "@/lib/auth";
import { eventTooLong } from "@/lib/events";

import { userFacingError } from "@/lib/user-facing-error";
export type ActionResult = { error?: string };

export async function createGymEvent(input: {
  title: string;
  eventDate: string;
  location: string;
  description: string;
  registrationUrl: string;
  isPaid: boolean;
}): Promise<ActionResult> {
  const { supabase, user } = await requireOwner();

  const title = input.title.trim();
  if (!title) {
    return { error: "Give the event a title." };
  }
  const tooLong = eventTooLong(title, input.description, input.location);
  if (tooLong) return { error: tooLong };
  const registrationUrl = input.registrationUrl.trim();
  if (registrationUrl && !registrationUrl.startsWith("https://")) {
    return { error: "The registration link must start with https://" };
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
    registration_url: registrationUrl || null,
    is_paid: input.isPaid,
    created_by: user.id,
  });

  if (error) {
    return { error: userFacingError(error) };
  }

  return {};
}
