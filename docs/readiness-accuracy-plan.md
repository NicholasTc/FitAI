# Readiness Score — Accuracy Improvement Plan

> Goal: drastically improve the accuracy of the readiness score **without ever making
> it worse or breaking the app.** Every change is additive, data-gated, and reversible.
> The current working logic always remains as a fallback floor.

This plan is grounded in the actual codebase as of the last scan. Each phase explicitly
separates **what already exists (reuse, do not recreate)** from **what is missing (must add)**
so we never write redundant code.

---

## Current state — honest baseline

The score today is a **hand-tuned weighted scorecard**, not a research-backed or learned model.

- `lib/readiness.ts` → `computeReadiness(snapshot, baseline, checkIn)` — pure function.
  - Subjective 40 pts (energy/sleepQuality/stress/motivation, linear).
  - Objective 40 pts (sleep duration, HRV vs avg, RHR vs avg — simple ratios).
  - Activity 20 pts (steps vs avg, sleep efficiency).
  - Day type cutoffs: Push ≥75, Maintain 50–74, Recover <50.
- `lib/baseline.ts` → `computeBaseline(history, today)` — **averages only**, 7-day window,
  `status: "forming" | "ready"` (ready at ≥5 days).
- Score is **computed on every load and never stored** — there is no score history.
- `Reflection` data is captured and shown in the weekly view but **never feeds back** into scoring.
- Weights are **hardcoded constants** — there is no weights/config storage.

### Known accuracy defects (what we are fixing)
1. Partial-day steps/calories compared to full-day averages → mornings unfairly penalized
   (e.g. 609 steps at 9am tanks the activity bucket).
2. Linear ratios ignore each metric's natural variability → reacts to noise, not real deviations.
3. Missing metrics silently substitute a flat neutral value (`score += 8`) → fabricates certainty.
4. Sleep **stages** (deep/REM) and `activeMinutes` are stored but unused in scoring.
5. No training-load / accumulated-fatigue awareness at all.
6. No learning loop — reflections don't tune anything.

---

## Safety architecture (applies to every phase)

These mechanisms are what guarantee "only improves, never breaks":

| Mechanism | Prevents |
|---|---|
| **Per-metric data gates** | A new method activating before it is statistically valid |
| **Legacy fallback always present** | Any new path failing → silent revert to known-good logic |
| **Shadow mode** | Flipping to a worse method blind — new method is computed & logged before it drives the UI |
| **Bounded modifiers** | An immature signal dominating the score |
| **Frozen weight snapshots** | Calibration drifting in the wrong direction |
| **Audit + agreement tracking (Phase 0)** | Not being able to tell whether a change helped or hurt |

**Contract rule:** `computeReadiness()` keeps its current input/output shape. New fields on
`ReadinessResult` are **additive and optional**. Nothing downstream
(`/api/today`, `lib/guardrails.ts`, `lib/ai/aiContext.ts`, trends/weekly) needs to change to keep working.

---

## Phase 0 — Instrumentation (do first; changes no behavior)

**Why:** We cannot claim "more accurate" without measuring it. Today the score is ephemeral,
so we have nothing to compare against. This phase is read-only and risk-free.

### Exists / reuse
- `ReadinessResult` already exposes `subjectiveScore`, `objectiveScore`, `hasCheckIn` (`types/today.ts`).
- `app/api/today/route.ts` already computes the full readiness result on each load.
- `Reflection` model already stores `accuracy` + `outcome` per day (`prisma/schema.prisma`).

### Missing / add
- **NEW Prisma model `ScoreAudit`** (one row per user per day):
  - `score`, `dayType`, `method` (`"legacy"` for now), `dataCompleteness` (0–1),
    and a JSON `breakdown` of each sub-component's contribution.
  - Unique `[userId, date]`, mirroring the existing `CheckIn`/`Reflection` pattern.
- **NEW helper `lib/scoreAudit.ts`** — `recordScoreAudit(...)`, called from `app/api/today/route.ts`
  after `computeReadiness`. Upsert (so re-loads overwrite, never duplicate).
- **EXTEND `computeReadiness`** to return an optional `breakdown` object (per-metric points +
  whether each was real data or a neutral fallback). Additive only.
- **Surface in `app/api/debug/route.ts`** (already our inspection surface) — show today's breakdown
  + recent `ScoreAudit` rows. No new UI required.

### Outcome
Every day's score and its reasoning become inspectable and historically queryable. This unlocks
verification for all later phases. **No user-visible change.**

---

## Phase 1 — Data-independent accuracy fixes (safe to ship now)

**Why:** These need **no history**, so they improve accuracy immediately at near-zero risk.
They fix defects #1, #3, #4 above.

### 1a. Time-of-day fairness (fixes defect #1)
- **Exists / reuse:** `lib/metricStatus.ts` already has an `isToday(date)` helper and the
  "so far" partial-day concept is already in `TodayView` for steps.
- **Missing / add:** In `lib/readiness.ts` `scoreActivity()`, when `date` is today, do **not**
  compare same-day steps/calories to the full-day average. Either (a) treat same-day activity as
  neutral until evening, or (b) compare against the expected fraction of the average by the current hour.
  - Requires passing `date` (and optionally current time) into `scoreActivity` — currently it only
    receives `snapshot` + `baseline`. Small signature extension, internal only.

### 1b. Confidence-weighted output (fixes defect #3)
- **Exists / reuse:** Null-handling branches already exist in `scoreObjective` (the `score += 8`
  fallbacks) and the `forming`/`ready` concept.
- **Missing / add:**
  - Compute a `dataCompleteness` (fraction of expected signals actually present).
  - Add an optional `confidence: "high" | "medium" | "low"` field to `ReadinessResult`.
  - Stop presenting flat substitutions as if they were measured — they still contribute, but the
    result is flagged lower-confidence.
  - Minor UI: surface confidence on the readiness hero (the hero already shows a status chip in
    `TodayView`, so this reuses existing space — no new component).

### 1c. Use sleep stages + efficiency properly (fixes defect #4)
- **Exists / reuse:** `sleepDeepMin`, `sleepRemMin`, `sleepLightMin`, `sleepEfficiency` are already
  pulled, stored (`DailyHealthSnapshot`), and present on `DailySnapshot`. **No schema change.**
- **Missing / add:** In `scoreObjective` sleep block, fold deep+REM proportion into the sleep
  sub-score rather than scoring duration alone. Keep duration as the primary term; stages adjust
  within the existing 15-pt budget (no rebalancing of bucket totals → cutoffs stay valid).

### Verification (Phase 0 enables this)
Re-run new vs. legacy scoring over existing days via the audit; confirm the only material
differences are the intended cases (e.g. morning step fairness). Ship behind a shadow flag first,
then switch.

---

## Phase 2 — Personal baselines (gated on ~21–28 days of data)

**Why:** Biggest single accuracy lever (fixes defect #2). **Must not activate early** — z-scores
are meaningless with a tiny/unstable standard deviation.

### Exists / reuse
- `lib/baseline.ts` already produces per-metric averages, `daysWithData`, and `status`.
- `loadSnapshots(userId, today, days)` **already takes a `days` arg** — we can request 28 days
  without a new function. Older data accrues naturally as days are synced.
- The `forming`/`ready` gating pattern is the template for the new per-metric gate.

### Missing / add
- **EXTEND `WeeklyBaseline`** (`types/snapshot.ts`) with optional per-metric **standard deviation**
  and a **sample count** per metric. (Rename is unnecessary; just add fields.)
- **EXTEND `computeBaseline`** to compute SD alongside the existing average (reuse the existing
  `pick()` non-null filter). Optionally add an EWMA (28-day, recent-weighted) average.
- **Raise the load window:** call `loadSnapshots(..., 28)` in `app/api/today/route.ts`; consider
  bumping `SYNC_DAYS` (currently 7 in `lib/sync.ts`) so the API backfills a longer window.
- **NEW scoring path in `lib/readiness.ts`:** z-score each objective metric
  (`(today − mean) / sd`) → points. **Gate:** only used for a metric when it has **≥14 valid days
  AND a stable non-trivial SD**; otherwise fall back to the current ratio logic. So the day this
  ships, behavior is unchanged and z-scoring switches on per-metric as data matures.
- **Personalized cutoffs (end of phase):** once `ScoreAudit` holds enough of *your* scores, derive
  Push/Maintain thresholds from your own percentiles instead of fixed 50/75. Store the derived
  thresholds (extend `UserSettings` or a small new config) so they are stable and inspectable.

### Verification
Shadow z-scoring for ~1–2 weeks via Phase 0 audit before it drives the UI. Confirm low-SD-noise
days stop moving the score and genuine deviations (≤ −1.5 SD) line up with rough-feeling days in
your reflections.

---

## Phase 3 — Training load / accumulated fatigue (gated on ~28 days)

**Why:** Largest conceptual gap (defect #5). Two hard days back-to-back should lower readiness even
if sleep/HRV look fine.

### Exists / reuse
- `activeMinutes` and `totalCalories` are already stored on `DailyHealthSnapshot` and present on
  `DailySnapshot` — **no schema change** for a first approximation of daily strain.
- `WorkoutSession` model exists (currently unused because Fitbit workout sessions aren't returned by
  the API) — leave as-is; do **not** build new on it yet.

### Missing / add
- **NEW helper `lib/trainingLoad.ts`:** compute an **acute (3–7 day)** vs **chronic (28-day)** strain
  ratio from `activeMinutes` (+ calories above resting as a secondary term).
- **Integrate as a bounded modifier, not a new bucket:** it adjusts the final score by a capped
  amount (e.g. ±10) rather than replacing an existing component. This caps how much a still-maturing
  signal can move the result and keeps the existing bucket math/cutoffs intact.
- **Gate:** contributes 0 (neutral) until a 28-day chronic window exists → identical to today before then.

### Verification
Shadow first; confirm acute spikes (e.g. after consecutive hard days) produce a sensible dampening
that matches your reflections.

---

## Phase 4 — Learn from reflections (gated on ~20+ reflections)

**Why:** Turns a generic estimate into something calibrated to *you* — without ML or a black box.

### Exists / reuse
- `Reflection` model already stores `accuracy` (`yes|somewhat|no`) and `outcome`
  (`great|good|skipped|rest`) per day (`prisma/schema.prisma`, `app/api/reflection/route.ts`).
- `app/api/weekly/route.ts` already aggregates reflection accuracy stats — reuse that aggregation.
- `ScoreAudit` (Phase 0) provides the predicted score/day-type to compare each reflection against.

### Missing / add
- **NEW Prisma model `ScoreWeights`** (per user): stores the tunable weights + a `version`, plus a
  **frozen `baselineWeights` snapshot** for instant rollback. Today's hardcoded constants become the
  seed/default.
- **EXTEND `computeReadiness`** to accept an optional `weights` arg, defaulting to the current
  constants when none are stored (additive; existing callers unaffected).
- **NEW calibration job `lib/calibration.ts`:** periodically compare predicted day type
  (`ScoreAudit`) vs. reflection outcome and apply **small, bounded** nudges to the weights driving
  wrong calls.
  - Safety: minimum sample of disagreements before any nudge; bounded delta per cycle; track an
    **agreement rate** over time; if calibration ever lowers agreement, **auto-revert** to the frozen
    snapshot.

### Verification
Agreement rate (predicted vs. reflected) must be non-decreasing across calibration cycles, else revert.

---

## Explicitly NOT doing (avoid scope creep / redundancy)
- **No full ML model** — not enough labeled data; would be an unexplainable black box. The
  z-score + load-ratio + bounded-calibration approach captures most of the benefit while staying
  interpretable.
- **No new SpO2 / respiratory-rate / skin-temp ingestion now** — marginal vs. Phases 1–2 and Fitbit
  calibration is unreliable.
- **No new reflection / sleep-stage / activeMinutes schema** — those already exist; we are using
  data we already collect.
- **No rewrite of `computeReadiness`'s contract** — only additive fields and optional args.

---

## Net new artifacts summary (nothing redundant)

| Artifact | Type | Status | Phase |
|---|---|---|---|
| `ScoreAudit` model | Prisma | **NEW** | 0 |
| `lib/scoreAudit.ts` | helper | **NEW** | 0 |
| `breakdown` on `ReadinessResult` | field | **EXTEND** | 0 |
| Time-of-day arg in `scoreActivity` | logic | **EXTEND** | 1 |
| `confidence` + `dataCompleteness` | field | **EXTEND** | 1 |
| Sleep-stage term in `scoreObjective` | logic | **EXTEND** | 1 |
| SD + sample count on `WeeklyBaseline` | field | **EXTEND** | 2 |
| SD/EWMA in `computeBaseline` | logic | **EXTEND** | 2 |
| z-score scoring path (gated) | logic | **NEW (in existing file)** | 2 |
| Personalized cutoffs config | config | **NEW/EXTEND** | 2 |
| `lib/trainingLoad.ts` | helper | **NEW** | 3 |
| `ScoreWeights` model | Prisma | **NEW** | 4 |
| `weights` arg on `computeReadiness` | param | **EXTEND** | 4 |
| `lib/calibration.ts` | helper | **NEW** | 4 |

Reused without modification: `Reflection`, `CheckIn`, `UserSettings`, `WorkoutSession`,
`DailyHealthSnapshot` (sleep stages / activeMinutes / totalCalories), `loadSnapshots` (`days` arg),
`app/api/weekly` reflection aggregation, `forming`/`ready` gating pattern, `lib/guardrails.ts`
(consumes score unchanged), `lib/ai/aiContext.ts` (consumes score unchanged).

---

## Recommended first commit
**Phase 0 + Phase 1 together** — safe, data-independent, immediately fixes the morning-fairness bug,
and stands up the measurement system every later phase depends on. Then let data accumulate and turn
on Phases 2 → 4 on their own schedule, each verified against reflections via the Phase 0 audit.
