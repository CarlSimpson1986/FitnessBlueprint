"use server";

import { requireProfile } from "@/lib/auth";
import { toLocalDateKey } from "@/lib/format";

export type ToggleHabitResult = { error?: string };

export async function toggleHabit(habitId: string, isCompleted: boolean): Promise<ToggleHabitResult> {
  const { supabase, user } = await requireProfile();
  const today = toLocalDateKey(new Date());

  if (isCompleted) {
    const { error } = await supabase
      .from("habit_logs")
      .delete()
      .eq("member_id", user.id)
      .eq("habit_id", habitId)
      .eq("log_date", today);

    if (error) {
      return { error: error.message };
    }
    return {};
  }

  const { error } = await supabase.from("habit_logs").insert({
    member_id: user.id,
    habit_id: habitId,
    log_date: today,
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}
