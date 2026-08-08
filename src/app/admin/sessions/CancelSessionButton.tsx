"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSession } from "./actions";

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let succeeded = false;

      try {
        const result = await cancelSession(sessionId);
        if (result.error) {
          setError(result.error);
        } else {
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
      >
        {isPending ? "…" : "Cancel session"}
      </button>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
