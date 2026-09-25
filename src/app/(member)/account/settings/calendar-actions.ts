"use server";

import { randomBytes } from "crypto";
import { requireProfile } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

export type FeedResult = { url?: string; error?: string };

const feedUrl = (token: string) => `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/calendar/${token}.ics`;

// Both go through the caller's RLS client — "people manage their own
// calendar feed token" (0034) limits them to their own row.

/** Returns the caller's calendar link, creating it the first time. */
export async function getCalendarFeedUrl(): Promise<FeedResult> {
  const { supabase, user } = await requireProfile();
  const { data: existing } = await supabase.from("calendar_feed_tokens").select("token").eq("profile_id", user.id).maybeSingle();
  if (existing) return { url: feedUrl(existing.token) };
  return resetCalendarFeedUrl();
}

/** Replaces the token, so any previously shared link stops working. */
export async function resetCalendarFeedUrl(): Promise<FeedResult> {
  const { supabase, user } = await requireProfile();
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase
    .from("calendar_feed_tokens")
    .upsert({ profile_id: user.id, token, created_at: new Date().toISOString() });
  return error ? { error: "Couldn't create your calendar link — please try again." } : { url: feedUrl(token) };
}
