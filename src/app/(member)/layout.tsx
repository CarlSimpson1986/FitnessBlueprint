import { requireProfile } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { HealthConsentPrompt } from "@/components/HealthConsentPrompt";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();

  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
      {/* After Ted's tour, so the two don't stack on a first visit. */}
      {profile.health_consent === null && profile.has_seen_ted_tour && <HealthConsentPrompt />}
    </div>
  );
}
