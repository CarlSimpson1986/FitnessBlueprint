import { requireProfile } from "@/lib/auth";
import { OwnerShell } from "@/components/OwnerShell";

/** The owner gets the desktop sidebar layout; coaches keep the phone layout. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return profile.role === "owner" ? <OwnerShell>{children}</OwnerShell> : <>{children}</>;
}
