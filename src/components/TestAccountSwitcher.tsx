"use client";

import { useState, useTransition } from "react";
import {
  returnToOwner,
  switchBetweenTestAccounts,
  switchToTestAccount,
} from "@/app/admin/test-accounts/actions";
import type { TestAccountKind } from "@/lib/test-accounts";

function useSwitch(action: (kind: TestAccountKind) => Promise<{ error?: string }>) {
  const [isPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<TestAccountKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(kind: TestAccountKind) {
    setError(null);
    setPendingKind(kind);
    startTransition(async () => {
      // Redirects on success, so anything returned here is an error.
      const result = await action(kind);
      if (result?.error) setError(result.error);
      setPendingKind(null);
    });
  }

  return { run, isPending, pendingKind, error };
}

/** Owner-only card on /admin: open the phone-frame "view as" for coach or member. */
export function TestAccountSwitcher() {
  const { run, isPending, pendingKind, error } = useSwitch(switchToTestAccount);

  return (
    <div className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5">
      <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">View as…</p>
      <p className="text-blueprint-muted text-sm leading-relaxed mb-4">
        See the app on a phone exactly as a coach or member does, using test accounts.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("coach")}
          disabled={isPending}
          className="fb-btn-primary flex-1 text-xs disabled:opacity-50"
        >
          {pendingKind === "coach" ? "Opening…" : "Coach"}
        </button>
        <button
          type="button"
          onClick={() => run("member")}
          disabled={isPending}
          className="fb-btn-primary flex-1 text-xs disabled:opacity-50"
        >
          {pendingKind === "member" ? "Opening…" : "Member"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

/** Controls beside the phone frame on /view-as. */
export function ViewAsControls({ current }: { current: TestAccountKind | null }) {
  const { run, isPending, pendingKind, error } = useSwitch(switchBetweenTestAccounts);
  const [isLeaving, startLeaving] = useTransition();

  const tabClass = (kind: TestAccountKind) =>
    "flex-1 rounded px-3 py-2 text-xs font-mono uppercase tracking-wide border transition disabled:opacity-50 " +
    (current === kind
      ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
      : "border-blueprint-line text-blueprint-muted hover:text-blueprint-ink");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => current !== "coach" && run("coach")}
          disabled={isPending || isLeaving}
          className={tabClass("coach")}
        >
          {pendingKind === "coach" ? "…" : "Coach"}
        </button>
        <button
          type="button"
          onClick={() => current !== "member" && run("member")}
          disabled={isPending || isLeaving}
          className={tabClass("member")}
        >
          {pendingKind === "member" ? "…" : "Member"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => startLeaving(() => returnToOwner())}
        disabled={isPending || isLeaving}
        className="w-full rounded border border-blueprint-line px-3 py-2 text-xs font-mono uppercase tracking-wide text-blueprint-ink hover:border-blueprint-accent disabled:opacity-50"
      >
        {isLeaving ? "Switching…" : "← Back to owner"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
