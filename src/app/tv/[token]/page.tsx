import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TvBoard, type TvSession } from "./TvBoard";

export const metadata: Metadata = {
  title: "Gym TV — Fitness Blueprint",
  robots: { index: false, follow: false },
};

// Tokens are randomBytes(24) as base64url (src/app/admin/account/gym-tv-actions.ts).
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * Public page left open on the gym TV: no account, the link's token is the
 * only key — gym_tv_board (0062) returns today's classes and workouts and
 * nothing else. TvBoard picks the class to show and reloads this every
 * minute.
 */
export default async function GymTvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("gym_tv_board", { p_token: token });
  if (data === null || !Array.isArray(data)) notFound();

  return <TvBoard sessions={data as unknown as TvSession[]} loadedAt={new Date().toISOString()} />;
}
