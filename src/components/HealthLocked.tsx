"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HealthConsentDialog } from "./HealthConsentDialog";

/** Stands in for a health screen when the member hasn't said yes to keeping health info (0043). */
export function HealthLocked({
  title = "Health tracking is off",
  body = "Check-ins, goals, habits and Coach Ted need your OK to keep your health info.",
}: {
  title?: string;
  body?: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  return (
    <div className="fb-card">
      <p className="text-sm text-blueprint-ink font-medium mb-1">{title}</p>
      <p className="text-sm text-blueprint-muted leading-relaxed mb-4">{body}</p>
      <button type="button" onClick={() => setAsking(true)} className="fb-btn-primary w-full">
        Turn on health tracking
      </button>
      {asking && (
        <HealthConsentDialog
          onClose={() => setAsking(false)}
          onAnswered={() => {
            setAsking(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
