"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"magic-link" | "password">("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
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

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("idle");

    if (data.user?.app_metadata?.must_change_password) {
      router.push("/login/set-password");
    } else {
      router.push("/");
    }
  }

  function toggleMode() {
    setMode((current) => (current === "magic-link" ? "password" : "magic-link"));
    setStatus("idle");
    setErrorMessage("");
    setPassword("");
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
          {mode === "magic-link"
            ? "Enter your email and we'll send you a link to sign in — no password needed."
            : "Sign in with the password the gym gave you."}
        </p>

        {mode === "magic-link" ? (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
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
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
              {status === "sending" ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={toggleMode}
          className="mt-6 text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent transition"
        >
          {mode === "magic-link" ? "Have a password instead?" : "Use magic link instead"}
        </button>
      </div>
    </main>
  );
}
