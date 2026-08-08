"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="blueprint-grid min-h-screen flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
            Check your inbox
          </p>
          <h1 className="font-display text-2xl text-blueprint-ink mb-3">
            Link sent to {email}
          </h1>
          <p className="text-blueprint-muted text-sm leading-relaxed">
            Click the link in the email to sign in. You can close this tab.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="blueprint-grid min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Sign in</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Enter your email and we&apos;ll send you a link to sign in — no password needed.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
            >
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
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
        </form>
      </div>
    </main>
  );
}
