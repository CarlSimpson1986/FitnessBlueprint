"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "confirm-email" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setStatus("error");
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setErrorMessage("Passwords don't match.");
      return;
    }

    setStatus("sending");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    // If email confirmations are off, signUp already returns a live
    // session — go straight to onboarding. If they're on, there's no
    // session yet until the confirmation link is clicked.
    if (data.session) {
      router.push("/onboarding");
    } else {
      setStatus("confirm-email");
    }
  }

  if (status === "confirm-email") {
    return (
      <div className="max-w-md w-full text-center">
        <p className="fb-eyebrow mb-1">Almost there</p>
        <h1 className="font-display text-2xl text-blueprint-ink mb-3">Confirm {email}</h1>
        <p className="text-blueprint-muted text-sm leading-relaxed">
          Click the link we just emailed you to confirm your address, then come back and sign in.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full">
      <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
      <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Create your account</h1>
      <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
        Choose a password — you&apos;ll use it every time you sign in.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
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
          <label htmlFor="confirm_password" className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
            Confirm password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
          />
        </div>

        {status === "error" && (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 disabled:opacity-50 transition"
        >
          {status === "sending" ? "Creating account…" : "Create account"}
        </button>
      </form>

      <a
        href="/login"
        className="mt-6 inline-block text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent transition"
      >
        Already have an account? Sign in
      </a>
    </div>
  );
}
