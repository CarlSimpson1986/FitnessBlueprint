"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HealthConsentDialog } from "./HealthConsentDialog";

/**
 * The after-sign-in ask (0043). Lives in the member layout, which stays
 * mounted between pages, so "Not now" holds until the app is next opened.
 * If they never answer, BookingButton asks again before their next booking.
 */
export function HealthConsentPrompt() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <HealthConsentDialog
      onClose={() => setOpen(false)}
      onAnswered={() => {
        setOpen(false);
        router.refresh();
      }}
    />
  );
}
