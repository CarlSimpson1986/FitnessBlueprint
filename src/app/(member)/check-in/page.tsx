import Image from "next/image";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { openCheckinWeek } from "@/lib/weekly-checkin";
import { CheckinForm } from "./CheckinForm";

export default async function WeeklyCheckinPage() {
  const { supabase, user, profile } = await requireProfile();
  const weekOf = openCheckinWeek();
  const firstName = profile.full_name.split(" ")[0] ?? "there";

  const [{ data: existing }, { data: lastWeight }] = await Promise.all([
    weekOf
      ? supabase.from("weekly_checkins").select("id").eq("member_id", user.id).eq("week_of", weekOf).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("body_metrics")
      .select("weight_kg")
      .eq("member_id", user.id)
      .not("weight_kg", "is", null)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-start justify-between mb-1">
          <p className="fb-eyebrow">Weekly check-in</p>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">How was your week?</h1>

        {!weekOf ? (
          <p className="text-sm text-blueprint-muted">
            Check-ins open on Sunday — Ted will remind you on the home page and by email.
          </p>
        ) : existing ? (
          <div className="fb-card flex items-start gap-3">
            <Image src="/coach-ted-avatar.png" alt="" width={32} height={32} className="rounded-full object-cover shrink-0" />
            <div>
              <p className="text-sm text-blueprint-ink mb-2">
                Checked in — thanks, {firstName}. Your coach can see it now. Same time next Sunday.
              </p>
              <Link href="/" className="text-xs text-blueprint-accent">
                Back to home →
              </Link>
            </div>
          </div>
        ) : (
          <CheckinForm firstName={firstName} lastWeightKg={lastWeight?.weight_kg ?? null} />
        )}
      </div>
    </main>
  );
}
