"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSession } from "./schedule-actions";

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
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-muted hover:text-red-400 disabled:opacity-50"
      >
        {isPending ? "…" : "Cancel session"}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
