/**
 * metricStatus — explains *why* a metric is null rather than showing "—".
 *
 * Each function returns a { label, sub } pair:
 *   label — the value or a short status word (shown where the number goes)
 *   sub   — one concise reason line (shown below the label, muted)
 *
 * Rules are derived from what we know about how Fitbit/Google Health works:
 *   - HRV requires a full tracked sleep with stage data
 *   - Partial sleep (no stages) means the night is still processing
 *   - For today's date, prefer "Pending" over "Not available"
 *   - For past dates, use "Not logged"
 */

export interface MetricText {
  label: string;   // replaces the numeric value
  sub: string;     // short reason, shown muted below
  isPending: boolean; // true → amber dot; false → gray
}

const isToday = (date: string) =>
  date === new Date().toLocaleDateString("en-CA");

// ─── Sleep ────────────────────────────────────────────────────────────────────

interface SleepFields {
  sleepMinutes: number | null;
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
}

/**
 * Returns null when sleep data is present (caller should render normally).
 * Returns MetricText when something is missing.
 */
export function sleepStatus(
  snapshot: SleepFields,
  date: string,
): MetricText | null {
  if (snapshot.sleepMinutes !== null) {
    // Data present — but check if stages are missing (partial sync)
    const hasStages =
      snapshot.sleepDeepMin !== null || snapshot.sleepRemMin !== null;
    if (!hasStages) {
      // Sleep duration recorded but no stages yet → still processing
      return {
        label: `${Math.floor(snapshot.sleepMinutes / 60)}h ${snapshot.sleepMinutes % 60}m`,
        sub: "Stages still processing",
        isPending: true,
      };
    }
    // Full data — no override needed
    return null;
  }

  // No sleep data at all
  if (isToday(date)) {
    return {
      label: "Pending",
      sub: "Not synced yet",
      isPending: true,
    };
  }
  return {
    label: "Not logged",
    sub: "Watch not worn overnight",
    isPending: false,
  };
}

// ─── HRV ─────────────────────────────────────────────────────────────────────

export function hrvStatus(
  snapshot: { hrv: number | null; sleepMinutes: number | null; sleepDeepMin: number | null },
  date: string,
): MetricText | null {
  if (snapshot.hrv !== null) return null; // data present

  const hasSleep = snapshot.sleepMinutes !== null;
  const hasStages = snapshot.sleepDeepMin !== null;

  if (hasSleep && !hasStages) {
    // Sleep recorded but stages missing → night is still processing
    return {
      label: "Processing",
      sub: "Appears after sleep stages sync",
      isPending: true,
    };
  }

  if (hasSleep && hasStages) {
    // Sleep + stages exist but still no HRV — Fitbit still calibrating
    return {
      label: "Calibrating",
      sub: "Usually available after a few nights",
      isPending: false,
    };
  }

  // No sleep at all
  if (isToday(date)) {
    return {
      label: "Pending",
      sub: "Requires a full tracked sleep",
      isPending: true,
    };
  }
  return {
    label: "Not available",
    sub: "No sleep logged that night",
    isPending: false,
  };
}

// ─── Resting HR ───────────────────────────────────────────────────────────────

export function rhrStatus(
  snapshot: { restingHr: number | null; sleepMinutes: number | null },
  date: string,
): MetricText | null {
  if (snapshot.restingHr !== null) return null;

  if (isToday(date)) {
    return {
      label: "Pending",
      sub: "Needs overnight wear to calculate",
      isPending: true,
    };
  }
  return {
    label: "Not available",
    sub: "Watch not worn overnight",
    isPending: false,
  };
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export function stepsStatus(
  snapshot: { steps: number | null },
  date: string,
): MetricText | null {
  if (snapshot.steps !== null) return null;

  if (isToday(date)) {
    return {
      label: "Pending",
      sub: "Syncs throughout the day",
      isPending: true,
    };
  }
  return {
    label: "Not synced",
    sub: "No step data for this day",
    isPending: false,
  };
}

// ─── Total Calories ────────────────────────────────────────────────────────────

export function caloriesStatus(
  snapshot: { totalCalories: number | null },
  date: string,
): MetricText | null {
  if (snapshot.totalCalories !== null) return null;

  if (isToday(date)) {
    return {
      label: "Pending",
      sub: "Finalises at end of day",
      isPending: true,
    };
  }
  return {
    label: "Not synced",
    sub: "No calorie data for this day",
    isPending: false,
  };
}
