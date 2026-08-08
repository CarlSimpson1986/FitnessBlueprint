"use client";

import { useActionState } from "react";
import { createProfile, type CreateProfileState } from "./actions";

const initialState: CreateProfileState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createProfile, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="full_name"
          className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
        >
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
          placeholder="Jane Smith"
        />
      </div>

      <div>
        <label
          htmlFor="phone"
          className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2"
        >
          Phone (optional)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
          placeholder="07123 456789"
        />
      </div>

      <fieldset className="border border-blueprint-line/60 rounded p-4">
        <legend className="text-xs font-mono uppercase tracking-wide text-blueprint-muted px-1">
          Emergency contact (optional)
        </legend>
        <div className="space-y-4 mt-2">
          <input
            name="emergency_contact_name"
            type="text"
            autoComplete="off"
            className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
            placeholder="Contact name"
          />
          <input
            name="emergency_contact_phone"
            type="tel"
            autoComplete="off"
            className="w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
            placeholder="Contact phone"
          />
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 disabled:opacity-50 transition"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
