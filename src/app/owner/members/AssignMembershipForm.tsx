"use client";

import { useState, useTransition, type FormEvent } from "react";
import { assignMembership } from "./actions";

type Plan = {
  id: string;
  name: string;
  price_pence: number;
  credit_pack_size: number | null;
};

export function AssignMembershipForm({
  memberId,
  plans,
}: {
  memberId: string;
  plans: Plan[];
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await assignMembership(memberId, planId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  if (plans.length === 0) {
    return <p className="text-xs text-blueprint-muted">No active plans configured.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <select
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          className="bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
              {plan.credit_pack_size ? ` (${plan.credit_pack_size} credits)` : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending || !planId}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Assign"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
      {success && <p className="text-xs text-blueprint-accent">Assigned.</p>}
    </form>
  );
}
