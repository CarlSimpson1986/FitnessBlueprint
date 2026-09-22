"use client";

import { useRouter, usePathname } from "next/navigation";
import { periodOptions, type PeriodUnit } from "@/lib/period";

const UNITS: { unit: PeriodUnit; label: string }[] = [
  { unit: "month", label: "Month" },
  { unit: "quarter", label: "Quarter" },
  { unit: "year", label: "Year" },
];

export function PeriodPicker({ unit, value }: { unit: PeriodUnit; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const options = periodOptions(unit, unit === "year" ? 6 : unit === "quarter" ? 12 : 24);

  function go(nextUnit: PeriodUnit, nextValue?: string) {
    const resolvedValue = nextValue ?? periodOptions(nextUnit, 1)[0]?.value ?? value;
    router.push(`${pathname}?unit=${nextUnit}&value=${resolvedValue}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-8">
      {UNITS.map((u) => (
        <button
          key={u.unit}
          type="button"
          onClick={() => go(u.unit)}
          className={
            "text-xs font-mono uppercase tracking-wide rounded px-3 py-1.5 border " +
            (unit === u.unit
              ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
              : "border-blueprint-line text-blueprint-muted hover:text-blueprint-ink")
          }
        >
          {u.label}
        </button>
      ))}
      <select
        value={value}
        onChange={(event) => go(unit, event.target.value)}
        className="text-xs font-mono uppercase tracking-wide rounded px-3 py-1.5 border border-blueprint-line bg-blueprint-raised text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
