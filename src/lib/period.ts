export type PeriodUnit = "month" | "quarter" | "year";

export type ResolvedPeriod = {
  start: Date;
  end: Date; // exclusive
  label: string;
  unit: PeriodUnit;
  value: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Reads ?unit=&value= (both optional) and resolves to a concrete date range. */
export function resolvePeriod(params: { unit?: string; value?: string }): ResolvedPeriod {
  const unit: PeriodUnit = params.unit === "quarter" || params.unit === "year" ? params.unit : "month";
  const now = new Date();

  if (unit === "year") {
    const year = params.value ? parseInt(params.value, 10) : now.getFullYear();
    return {
      start: new Date(year, 0, 1),
      end: new Date(year + 1, 0, 1),
      label: `${year}`,
      unit,
      value: `${year}`,
    };
  }

  if (unit === "quarter") {
    const defaultValue = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    const [yearStr, qStr] = (params.value ?? defaultValue).split("-Q");
    const year = parseInt(yearStr ?? `${now.getFullYear()}`, 10);
    const quarter = parseInt(qStr ?? "1", 10);
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 1),
      label: `Q${quarter} ${year}`,
      unit,
      value: `${year}-Q${quarter}`,
    };
  }

  const defaultValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [yearStr, monthStr] = (params.value ?? defaultValue).split("-");
  const year = parseInt(yearStr ?? `${now.getFullYear()}`, 10);
  const month = parseInt(monthStr ?? pad(now.getMonth() + 1), 10) - 1;
  const start = new Date(year, month, 1);
  return {
    start,
    end: new Date(year, month + 1, 1),
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    unit,
    value: `${year}-${pad(month + 1)}`,
  };
}

/** Selectable options for the given granularity, most recent first. */
export function periodOptions(unit: PeriodUnit, count = 12): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];

  if (unit === "month") {
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      });
    }
  } else if (unit === "quarter") {
    const currentAbsoluteQuarter = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
    for (let i = 0; i < count; i++) {
      const idx = currentAbsoluteQuarter - i;
      const year = Math.floor(idx / 4);
      const quarter = (idx % 4) + 1;
      options.push({ value: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const year = now.getFullYear() - i;
      options.push({ value: `${year}`, label: `${year}` });
    }
  }

  return options;
}
