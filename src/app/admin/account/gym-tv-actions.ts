"use server";

import { randomBytes } from "crypto";
import { requireOwner } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

export type GymTvResult = { url?: string; error?: string };

const tvUrl = (token: string) => `${publicEnv.NEXT_PUBLIC_SITE_URL}/tv/${token}`;

// Both go through the owner's RLS client — "gym_tv_link: read/create/
// change" (0062) are owner only.

/** Returns the gym TV link, creating it the first time. */
export async function getGymTvUrl(): Promise<GymTvResult> {
  const { supabase } = await requireOwner();
  const { data: existing } = await supabase.from("gym_tv_link").select("token").maybeSingle();
  if (existing) return { url: tvUrl(existing.token) };
  return resetGymTvUrl();
}

/** Replaces the token, so the old TV link stops working. */
export async function resetGymTvUrl(): Promise<GymTvResult> {
  const { supabase } = await requireOwner();
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase
    .from("gym_tv_link")
    .upsert({ id: true, token, created_at: new Date().toISOString() });
  return error ? { error: "Couldn't create the TV link — please try again." } : { url: tvUrl(token) };
}
