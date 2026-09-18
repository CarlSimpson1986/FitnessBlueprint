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
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">
          Welcome to Fitness Blueprint
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Tell us about you</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Just the essentials — you can add more later.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
