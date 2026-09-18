import { requireProfile } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProfile();

  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
