import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="blueprint-grid min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Set your password</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Choose a new password to replace the one the gym gave you.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
