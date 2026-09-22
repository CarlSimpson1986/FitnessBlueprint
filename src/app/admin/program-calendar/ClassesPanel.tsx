"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClass, updateClass, setClassActive, type ClassInput } from "./classes-actions";

export type ClassRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_duration_minutes: number;
  default_capacity: number;
  is_active: boolean;
};

const emptyForm: ClassInput = {
  code: "",
  name: "",
  description: "",
  defaultDurationMinutes: 60,
  defaultCapacity: 12,
};

function ClassForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: ClassInput;
  onSubmit: (input: ClassInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit(form);
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  const inputClass =
    "w-full bg-blueprint-bg border border-blueprint-line rounded px-2 py-1.5 text-xs text-blueprint-ink focus:outline-none focus:border-blueprint-accent";

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border border-blueprint-line/60 rounded p-3">
      <input
        placeholder="Code (e.g. FNL)"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
        className={inputClass}
      />
      <input
        placeholder="Name (e.g. Friday Night Lights)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={inputClass}
      />
      <textarea
        placeholder="Description (optional)"
        value={form.description ?? ""}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={inputClass}
        rows={2}
      />
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          placeholder="Duration (min)"
          value={form.defaultDurationMinutes}
          onChange={(e) => setForm({ ...form, defaultDurationMinutes: Number(e.target.value) })}
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          placeholder="Capacity"
          value={form.defaultCapacity}
          onChange={(e) => setForm({ ...form, defaultCapacity: Number(e.target.value) })}
          className={inputClass}
        />
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="text-[10px] font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-3 py-1.5 disabled:opacity-50"
        >
          {isPending ? "…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-3 py-1.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function ClassesPanel({ classes }: { classes: ClassRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleCreate(input: ClassInput) {
    const result = await createClass(input);
    if (!result.error) {
      setAdding(false);
      router.refresh();
    }
  }

  async function handleUpdate(classId: string, input: ClassInput) {
    const result = await updateClass(classId, input);
    if (!result.error) {
      setEditingId(null);
      router.refresh();
    }
  }

  async function handleToggleActive(classId: string, isActive: boolean) {
    await setClassActive(classId, isActive);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="fb-eyebrow">Classes</p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[10px] font-mono uppercase tracking-wide text-blueprint-accent hover:opacity-80"
          >
            + Add
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <ClassForm initial={emptyForm} onSubmit={handleCreate} onCancel={() => setAdding(false)} submitLabel="Create" />
        </div>
      )}

      <ul className="space-y-1.5">
        {classes.map((c) =>
          editingId === c.id ? (
            <li key={c.id}>
              <ClassForm
                initial={{
                  code: c.code,
                  name: c.name,
                  description: c.description ?? "",
                  defaultDurationMinutes: c.default_duration_minutes,
                  defaultCapacity: c.default_capacity,
                }}
                onSubmit={(input) => handleUpdate(c.id, input)}
                onCancel={() => setEditingId(null)}
                submitLabel="Save"
              />
            </li>
          ) : (
            <li
              key={c.id}
              className={
                "flex items-center justify-between gap-2 text-xs rounded px-2 py-1.5 " +
                (c.is_active ? "" : "opacity-50")
              }
            >
              <button type="button" onClick={() => setEditingId(c.id)} className="text-left flex-1 min-w-0">
                <span className="text-blueprint-ink">{c.name}</span>
                <span className="text-blueprint-muted"> · {c.code}</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(c.id, !c.is_active)}
                className="text-[9px] font-mono uppercase text-blueprint-muted hover:text-blueprint-accent shrink-0"
              >
                {c.is_active ? "Deactivate" : "Activate"}
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
