import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { TedChat } from "./TedChat";
import { HealthLocked } from "@/components/HealthLocked";
import { hasActiveMembership, NO_MEMBERSHIP_MESSAGE } from "@/lib/coach-ted/access";

const HISTORY_LIMIT = 20;

export default async function CoachTedPage() {
  const { supabase, user, profile } = await requireProfile();

  // Same rule as /api/coach-ted: members need an active membership.
  const isMember = profile.role !== "member" || (await hasActiveMembership(supabase, user.id));

  const { data: conversations } = await supabase
    .from("coach_ted_conversations")
    .select("id, question, answer, created_at, member_rating")
    .eq("member_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const initialMessages = (conversations ?? [])
    .slice()
    .reverse()
    .map((c) => ({ id: c.id, question: c.question, answer: c.answer, conversationId: c.id, rating: c.member_rating }));

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="flex items-start justify-between mb-1">
        <p className="fb-eyebrow">Fitness Blueprint</p>
        <HomeLink />
      </div>
      <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">Coach Ted</h1>
      {!isMember ? (
        <div className="fb-card">
          <p className="text-sm text-blueprint-muted">{NO_MEMBERSHIP_MESSAGE}</p>
        </div>
      ) : profile.health_consent ? (
        <>
          <TedChat initialMessages={initialMessages} />
          <p className="text-xs text-blueprint-muted mt-6 leading-relaxed">
            Coach Ted is an AI and can get things wrong. He isn&apos;t medical advice: for pain, injury or
            any health worry, speak to your GP or physio.
          </p>
        </>
      ) : (
        <HealthLocked body="Coach Ted tailors his answers to your goals and check-ins, so he needs your OK to use your health info." />
      )}
    </main>
  );
}
