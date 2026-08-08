"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createMemberAccount } from "./actions";

export function CreateMemberForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setGeneratedPassword(null);

    startTransition(async () => {
      let succeeded = false;

      try {
        const result = await createMemberAccount(fullName, email);
        if (result.error) {
          setError(result.error);
        } else if (result.password) {
          setGeneratedPassword(result.password);
          setFullName("");
          setEmail("");
          succeeded = true;
        }
      } catch {
        setError("Something went wrong — please try again.");
      }

      if (succeeded) {
        startTransition(() => {
          router.refresh();
        });
      }
    });
  }

  return (
    <div className="mb-10 border border-blueprint-line/60 rounded p-5">
      <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-muted uppercase mb-4">
        Create account manually
      </h2>
      <p className="text-xs text-blueprint-muted mb-4 leading-relaxed">
        Use this if a member&apos;s email isn&apos;t working. Give them the password shown below
        after creating — they&apos;ll be forced to set their own on first login. It&apos;s only shown
        once, so copy it before doing anything else.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Full name"
          className="flex-1 bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="flex-1 bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
        />
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap"
        >
          {isPending ? "Creating…" : "Create account"}
        </button>
      </form>
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      {generatedPassword && (
        <div className="mt-4 bg-blueprint-raised border border-blueprint-accent rounded p-3">
          <p className="text-xs text-blueprint-muted mb-1">Password (shown once — copy it now):</p>
          <p className="font-mono text-sm text-blueprint-ink select-all">{generatedPassword}</p>
        </div>
      )}
    </div>
  );
}
