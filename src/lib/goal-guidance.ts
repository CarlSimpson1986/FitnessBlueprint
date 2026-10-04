/**
 * Evidence-based weekly rates the goal wizard (GoalWizard.tsx) uses to
 * suggest a realistic 6-week target and to push back on unrealistic ones.
 *
 * Fat loss — ~0.5–1% of bodyweight per week. Slower loss preserves more
 * lean mass: Garthe et al. 2011 (Int J Sport Nutr Exerc Metab) found
 * athletes losing ~0.7%/week kept more lean mass than ~1.4%/week; Helms,
 * Aragon & Fitschen 2014 (JISSN) recommend 0.5–1%/week.
 *
 * Muscle gain — ~0.25–0.5% of bodyweight per week, beginners toward the
 * top of that range; faster gain is mostly fat (Iraki et al. 2019, Sports,
 * off-season bodybuilding recommendations).
 *
 * Body fat % — derived from the fat-loss rate at the member's current body
 * fat, assuming the weight lost is mostly fat (so an estimate, and Ted says
 * so). During a muscle-gain phase body fat % should stay roughly flat.
 */

export type GoalDirection = "down" | "up";

export type Guidance = {
  direction: GoalDirection;
  unit: "kg" | "%";
  /** Realistic change over 6 weeks, low/high, in `unit`. */
  sixWeekLow: number;
  sixWeekHigh: number;
  /** What Ted says, citing the source. */
  explanation: string;
  /** Moving the other way is fine too (body fat dropping while building muscle). */
  eitherWayOk?: boolean;
};

const WEEKS = 6;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function guidanceFor(
  goal: "lose_fat" | "build_muscle",
  metric: "Weight (kg)" | "Body fat %",
  baseline: number
): Guidance | null {
  if (goal === "lose_fat" && metric === "Weight (kg)") {
    const low = baseline * 0.005 * WEEKS;
    const high = baseline * 0.01 * WEEKS;
    return {
      direction: "down",
      unit: "kg",
      sixWeekLow: round1(low),
      sixWeekHigh: round1(high),
      explanation:
        `The research says aim for 0.5–1% of your bodyweight a week — at ${baseline}kg that's ` +
        `${round1(baseline * 0.005)}–${round1(baseline * 0.01)}kg a week. Going slower keeps more muscle ` +
        `(Garthe et al. 2011; Helms et al. 2014). Over 6 weeks that's about ${round1(low)}–${round1(high)}kg.`,
    };
  }

  if (goal === "lose_fat" && metric === "Body fat %") {
    // Fat mass falls by the weekly loss; body fat % = fat / remaining
    // weight. Bodyweight cancels out (loss is a % of it), so it isn't needed.
    const pctAfter = (weeklyFraction: number) => {
      const lost = weeklyFraction * WEEKS;
      return ((baseline / 100 - lost) / (1 - lost)) * 100;
    };
    const low = baseline - pctAfter(0.005);
    const high = baseline - pctAfter(0.01);
    return {
      direction: "down",
      unit: "%",
      sixWeekLow: round1(low),
      sixWeekHigh: round1(high),
      explanation:
        `Losing 0.5–1% of your bodyweight a week, mostly as fat, is the pace that protects muscle ` +
        `(Garthe et al. 2011; Helms et al. 2014). From ${baseline}% that works out at roughly ` +
        `${round1(low)}–${round1(high)} percentage points over 6 weeks — an estimate, as scales and ` +
        `callipers wobble week to week.`,
    };
  }

  if (goal === "build_muscle" && metric === "Weight (kg)") {
    const low = baseline * 0.0025 * WEEKS;
    const high = baseline * 0.005 * WEEKS;
    return {
      direction: "up",
      unit: "kg",
      sixWeekLow: round1(low),
      sixWeekHigh: round1(high),
      explanation:
        `For building muscle the research says gain 0.25–0.5% of your bodyweight a week — at ${baseline}kg ` +
        `that's ${round1(baseline * 0.0025)}–${round1(baseline * 0.005)}kg a week, newer lifters toward the top ` +
        `end. Gaining faster than that is mostly fat (Iraki et al. 2019). Over 6 weeks: about ` +
        `${round1(low)}–${round1(high)}kg.`,
    };
  }

  if (goal === "build_muscle" && metric === "Body fat %") {
    return {
      direction: "up",
      unit: "%",
      sixWeekLow: 0,
      sixWeekHigh: 1,
      eitherWayOk: true,
      explanation:
        `While building muscle, body fat % should stay roughly flat — gaining at 0.25–0.5% of bodyweight a ` +
        `week keeps fat gain small (Iraki et al. 2019). Aim to finish the 6 weeks within about 1 point of ` +
        `${baseline}%.`,
    };
  }

  return null;
}

/** 6-week target values Ted offers as one-tap picks. */
export function suggestedTargets(baseline: number, g: Guidance) {
  const apply = (delta: number) => round1(g.direction === "down" ? baseline - delta : baseline + delta);
  const mid = (g.sixWeekLow + g.sixWeekHigh) / 2;
  return [
    { label: "Steady", value: apply(g.sixWeekLow) },
    { label: "Solid", value: apply(mid) },
    { label: "Ambitious", value: apply(g.sixWeekHigh) },
  ];
}

/**
 * Pushes back when a 6-week target is outside the evidence-based range
 * (a bit of slack over the top end, and the wrong direction entirely).
 */
export function checkTarget(baseline: number, target: number, g: Guidance): string | null {
  const change = g.direction === "down" ? baseline - target : target - baseline;
  if (change < 0 && !g.eitherWayOk) {
    return g.direction === "down"
      ? `That's going up, not down from ${baseline}${g.unit === "kg" ? "kg" : "%"}.`
      : `That's going down, not up from ${baseline}${g.unit === "kg" ? "kg" : "%"}.`;
  }
  if (change > g.sixWeekHigh * 1.15 + 0.05) {
    const best = round1(g.direction === "down" ? baseline - g.sixWeekHigh : baseline + g.sixWeekHigh);
    return `That's ${round1(change)}${g.unit === "kg" ? "kg" : " points"} in 6 weeks — faster than the research backs. Around ${best} is the top end of realistic.`;
  }
  return null;
}

export type Timeline = {
  /** Weeks to the big-picture target at the top / bottom of the research rate. */
  fastWeeks: number;
  slowWeeks: number;
  /** What Ted says about the pace, citing the source. */
  explanation: string;
};

/**
 * How long the big-picture target should take at the same research rates
 * as the 6-week guidance above, so Ted can offer a date instead of asking
 * the member to guess one. Null when there's no rate to go on (muscle-gain
 * body fat, measurements, lifts, the member's own metric) or the target is
 * the wrong way.
 */
export function timelineFor(
  goal: "lose_fat" | "build_muscle",
  metric: "Weight (kg)" | "Body fat %",
  baseline: number,
  target: number
): Timeline | null {
  if (goal === "lose_fat" && metric === "Weight (kg)") {
    const toLose = baseline - target;
    if (toLose <= 0) return null;
    return {
      fastWeeks: Math.ceil(toLose / (baseline * 0.01)),
      slowWeeks: Math.ceil(toLose / (baseline * 0.005)),
      explanation:
        `To lose fat and hang on to muscle, the research says lose ${round1(baseline * 0.005)}–${round1(baseline * 0.01)}kg ` +
        `a week at your weight (0.5–1% of bodyweight; Garthe et al. 2011, Helms et al. 2014). ` +
        `${round1(toLose)}kg at that pace takes`,
    };
  }

  if (goal === "lose_fat" && metric === "Body fat %") {
    // Same model as guidanceFor: after n weeks losing fraction f a week,
    // all as fat, body fat = (b - f·n) / (1 - f·n). Solved for n.
    const b = baseline / 100;
    const t = target / 100;
    if (t >= b || t <= 0) return null;
    const weeksAt = (f: number) => Math.ceil((b - t) / (f * (1 - t)));
    return {
      fastWeeks: weeksAt(0.01),
      slowWeeks: weeksAt(0.005),
      explanation:
        `Losing 0.5–1% of your bodyweight a week, mostly as fat, is the pace that protects muscle ` +
        `(Garthe et al. 2011; Helms et al. 2014). ${baseline}% down to ${target}% at that pace takes`,
    };
  }

  if (goal === "build_muscle" && metric === "Weight (kg)") {
    const toGain = target - baseline;
    if (toGain <= 0) return null;
    return {
      fastWeeks: Math.ceil(toGain / (baseline * 0.005)),
      slowWeeks: Math.ceil(toGain / (baseline * 0.0025)),
      explanation:
        `To add muscle and keep fat gain to a minimum, the research says gain ${round1(baseline * 0.0025)}–` +
        `${round1(baseline * 0.005)}kg a week at your weight (0.25–0.5% of bodyweight, newer lifters toward ` +
        `the top end; Iraki et al. 2019). ${round1(toGain)}kg at that pace takes`,
    };
  }

  return null;
}

/** Big-picture dates Ted offers as one-tap picks, soonest last. */
export function suggestedDates(timeline: Timeline, from: Date) {
  const at = (weeks: number) => {
    const d = new Date(from);
    d.setDate(d.getDate() + weeks * 7);
    return d;
  };
  return [
    { label: "Steady", date: at(timeline.slowWeeks) },
    { label: "Solid", date: at(Math.round((timeline.fastWeeks + timeline.slowWeeks) / 2)) },
    { label: "Ambitious", date: at(timeline.fastWeeks) },
  ];
}
