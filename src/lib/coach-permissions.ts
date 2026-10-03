import "server-only";
import { redirect } from "next/navigation";
import { requireCoachOrOwner } from "@/lib/auth";

/**
 * Per-coach on/off switches for the coach app, set by the owner on the
 * Members page (0042). RLS enforces the same switches via
 * staff_can_view() — these helpers just keep the menu and pages in step,
 * so a coach never lands on a page that RLS will show as empty.
 */

export const COACH_AREAS = [
  { key: "today", column: "can_view_today", label: "Today", hint: "Their sessions and attendance" },
  { key: "programme", column: "can_view_programme", label: "Programme", hint: "The programme calendar, view only" },
  {
    key: "checkins",
    column: "can_view_checkins",
    label: "Check-ins",
    hint: "Check-ins, readiness, weigh-ins, habits and goals",
  },
] as const;

export type CoachArea = (typeof COACH_AREAS)[number]["key"];
export type CoachAreaAccess = Record<CoachArea, boolean>;

const ALL_ON: CoachAreaAccess = { today: true, programme: true, checkins: true };

type PermissionRow = { can_view_today: boolean; can_view_programme: boolean; can_view_checkins: boolean };

/** No row = everything on (0042). */
export function toAreaAccess(row: PermissionRow | null | undefined): CoachAreaAccess {
  if (!row) return { ...ALL_ON };
  return { today: row.can_view_today, programme: row.can_view_programme, checkins: row.can_view_checkins };
}

/** requireCoachOrOwner, plus what this person can see. The owner sees everything. */
export async function requireStaffAccess() {
  const result = await requireCoachOrOwner();
  if (result.profile.role === "owner") {
    return { ...result, access: { ...ALL_ON } };
  }

  const { data } = await result.supabase
    .from("coach_permissions")
    .select("can_view_today, can_view_programme, can_view_checkins")
    .eq("coach_id", result.profile.id)
    .maybeSingle();

  return { ...result, access: toAreaAccess(data) };
}

/** Page/action guard: sends a coach back to /admin if Guy has turned this area off for them. */
export async function requireCoachArea(area: CoachArea) {
  const result = await requireStaffAccess();
  if (!result.access[area]) {
    redirect("/admin");
  }
  return result;
}
