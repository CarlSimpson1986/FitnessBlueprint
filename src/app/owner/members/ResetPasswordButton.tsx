"use client";

import { useState, useTransition } from "react";
import { resetMemberPassword } from "./actions";

export function ResetPasswordButton({ memberId }: { memberId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resetMemberPassword(memberId);
      if (result.error) {
        setError(result.error);
      } else if (result.password) {
        setPassword(result.password);
      }
    });
  }

  if (password) {
    return (
      <div className="bg-blueprint-raised border border-blueprint-accent rounded px-3 py-2 text-right">
        <p className="text-xs text-blueprint-muted mb-1">New password (shown once):</p>
        <p className="font-mono text-sm text-blueprint-ink select-all">{password}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-3 py-2 hover:border-blueprint-accent hover:text-blueprint-accent disabled:opacity-50 transition"
      >
        {isPending ? "…" : "Reset password"}
      </button>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
