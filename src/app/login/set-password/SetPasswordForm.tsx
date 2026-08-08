"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearMustChangePasswordFlag } from "./actions";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const flagResult = await clearMustChangePasswordFlag();
      if (flagResult.error) {
        setError(flagResult.error);
        return;
      }

      router.push("/");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
        >
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>
      <div>
        <label
          htmlFor="confirm_password"
          className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
        >
          Confirm password
        </label>
        <input
          id="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 disabled:opacity-50 transition"
      >
        {isPending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
