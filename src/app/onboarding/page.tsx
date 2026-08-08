import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    redirect("/");
  }

  return (
    <main className="blueprint-grid min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Welcome to Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Tell us about you</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Just the essentials — you can add more later.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
