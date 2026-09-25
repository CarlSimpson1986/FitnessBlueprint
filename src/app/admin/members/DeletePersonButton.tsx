"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePerson } from "./actions";

/** Two-step delete (no browser confirm dialog): Delete → "Yes, delete". */
export function DeletePersonButton({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      let succeeded = false;
      try {
        const result = await deletePerson(personId);
        if (result.error) setError(result.error);
        else succeeded = true;
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
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Delete {name} for good?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-red-500 rounded px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => (setConfirming(false), setError(null))}
            disabled={isPending}
            className="text-xs font-mono uppercase tracking-wide text-blueprint-muted px-2 py-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-mono uppercase tracking-wide text-red-400 border border-red-400/50 rounded px-3 py-2 hover:bg-red-500/10 transition"
        >
          Delete
        </button>
      )}
      {error && <p className="text-xs text-red-400 max-w-[18rem] text-right">{error}</p>}
    </div>
  );
}
