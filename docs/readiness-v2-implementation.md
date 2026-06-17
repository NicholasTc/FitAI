# Readiness Score v2 — Implementation Record

> Built as Phase 0–3 of the accuracy improvement plan in `readiness-accuracy-plan.md`.
> Implemented as a single additive changeset with no breaking changes to existing APIs,
> UI, or database contracts.

---

## What changed vs. v1

### Summary table

| Phase | Change | Files touched |
|---|---|---|
| 0 | Score audit — persist breakdown to DB | `prisma/schema.prisma`, `lib/scoreAudit.ts`, `app/api/today/route.ts` |
| 1a | Time-of-day fairness — same-day steps neutral | `lib/readiness.ts` |
| 1b | Confidence level on every result | `lib/readiness.ts`, `types/today.ts`, `components/views/TodayView.tsx` |
| 1c | Sleep stage quality in scoring | `lib/readiness.ts` |
| 2 | Z-score baselines, SD computation, 28-day window | `lib/baseline.ts`, `types/snapshot.ts`, `lib/readiness.ts`, `app/api/today/route.ts` |
| 3 | Acute:chronic training load modifier | `lib/trainingLoad.ts`, `lib/readiness.ts`, `app/api/today/route.ts` |

---

## v1 vs. v2 — approach comparison

### V1 (what it was)
- **Method:** Hand-tuned weighted scorecard with fixed ratio comparisons.
- **Baselines:** Simple 7-day arithmetic mean per metric.
- **HRV scoring:** `clamp(today/avg * 11, 0, 15)` — linear ratio, reacts to noise.
- **RHR scoring:** `clamp(avg/today * 8, 0, 10)` — linear ratio.
- **Sleep scoring:** Duration only. Deep/REM stages collected but unused.
- **Activity:** Steps compared to full-day average even at 9am → morning penalty.
- **Training load:** Not modelled at all.
- **History persisted:** Nothing — score computed on every load and discarded.
- **Confidence:** None — missing metrics substituted with silent neutral values.

### V2 (what it is now)
- **Method:** Same core structure, but each scoring path is individually data-gated.
  Old paths remain as fallbacks. No behavior changes until gate conditions are met.
- **Baselines:** Up to 28-day window (down to 7 when less history exists).
  Standard deviations computed per metric alongside the mean.
- **HRV scoring:** z-score `(today − mean) / SD` when `n ≥ 14` AND `SD ≥ 3ms`.
  Falls back to legacy ratio until then.
- **RHR scoring:** z-score (inverted) when `n ≥ 14` AND `SD ≥ 0.8bpm`.
  Falls back to legacy ratio until then.
- **Sleep scoring:** Duration ratio as before, plus a ±2pt stage quality bonus
  based on deep+REM proportion of total sleep.
- **Activity:** Same-day (today's date) steps treated as neutral — no morning penalty.
  Past-day comparison preserved for historical scores.
- **Training load:** Acute (7-day avg) / chronic (28-day avg) ratio modifier ±10pts.
  Dormant until `≥ 14` chronic days with active-minutes data.
- **History persisted:** `ScoreAudit` table — every day's score, method, and
  full breakdown saved to PostgreSQL.
- **Confidence:** `"high" | "medium" | "low"` derived from fraction of real (non-null)
  signals. Shown as a chip on the readiness hero card.

---

## Concepts used and their rationale

### Z-score normalization (Phase 2)
**What:** `z = (today − personal_mean) / personal_SD`
**Why:** Personal variability is different for everyone. A 6ms HRV drop might be
normal noise for one person and a meaningful red flag for another. Z-scores measure
"how unusual is this value *for you*" rather than "how does this compare to average."
This is the same approach used by WHOOP and Oura for readiness scoring.
**Gate:** Requires ≥14 valid observations AND a stable, non-trivial standard deviation
(`SD ≥ 3ms` for HRV, `≥ 0.8bpm` for RHR). Below threshold → legacy ratio scoring.

### Sample standard deviation (`lib/baseline.ts`)
**What:** `SD = sqrt(Σ(x − mean)² / (n − 1))`  (Bessel-corrected, n−1 denominator)
**Why:** Unbiased estimator for a sample — appropriate here since we have a finite
window of observations, not the entire population.

### Acute:Chronic Workload Ratio (Phase 3)
**What:** `ratio = avg(last 7 days active-minutes) / avg(last 28 days active-minutes)`
**Why:** Based on the ACWR framework from sports science literature (Banister, Hulin
et al.). When acute load spikes above chronic baseline (ratio > 1.2), injury risk and
fatigue accumulation are elevated even if overnight recovery metrics look fine.
When acute is below chronic (ratio < 0.8), the athlete is tapering → may be fresher.
**Gate:** Requires ≥14 valid chronic data points. Modifier bounded ±10pts to prevent
a single signal dominating. Contributes 0 until gate passes — identical to v1 before then.

### Deep+REM sleep quality (Phase 1c)
**What:** `qualityRatio = (deepMin + remMin) / totalSleepMin`; applies ±2pt adjustment.
**Why:** Sleep science consensus: combined deep+REM should be ~30–35% of total sleep
for restorative recovery. Fragmented sleep (low stages) with adequate duration should
not score the same as high-quality sleep of equivalent length.
**Thresholds:** ≥35% → +2pts; 25–35% → +1pt; 15–25% → 0; <15% → −1pt.
Bounded within the existing 15pt sleep budget — day type cutoffs unaffected.

### Time-of-day fairness (Phase 1a)
**What:** If `date === today`, skip step-comparison and use neutral 5pts instead.
**Why:** Steps are a full-day metric. Comparing 609 steps at 9am to a 8,000-step
daily average is not measuring recovery — it is measuring time-of-day. This comparison
was suppressing scores every morning and creating a false signal. Past-day comparison
is preserved for historical readiness calculations.

### Confidence + data completeness (Phase 1b + Phase 0)
**What:** Count the fraction of 4 key signals (sleep, HRV, RHR, check-in) that are
real data (not null). `dataCompleteness = real / 4`. Mapped to `high ≥ 75%`,
`medium ≥ 50%`, `low < 50%`.
**Why:** V1 substituted missing signals with flat neutral values and presented a
confident score regardless. This fabricated certainty. V2 makes data coverage explicit:
the score still runs (it has to function from day 1), but you now know how much of it
is real vs. estimated.

### ScoreAudit table (Phase 0)
**What:** One DB row per user per day: score, day type, scoring method used, data
completeness, and a full `breakdown` JSON of per-component contributions.
**Why:** Without persisting scores, there is no way to measure whether a code change
improved accuracy vs. just changed the numbers. This table is the foundation for
Phase 4 (reflection feedback loop) and for the future "agreement rate" metric
(how often did the predicted day type match your reflection?).

---

## New files

| File | Purpose |
|---|---|
| `lib/trainingLoad.ts` | Acute:chronic workload ratio computation |
| `lib/scoreAudit.ts` | Fire-and-forget score persistence to `ScoreAudit` |

## Modified files

| File | What changed |
|---|---|
| `prisma/schema.prisma` | Added `ScoreAudit` model |
| `types/snapshot.ts` | Added SD fields + sample counts to `WeeklyBaseline` |
| `types/today.ts` | Added `ScoreBreakdown` interface; extended `ReadinessResult` |
| `lib/baseline.ts` | Added `stdDev()` helper; compute SD + counts per metric; 28-day support |
| `lib/readiness.ts` | Full rewrite preserving v1 fallbacks; added all Phase 0–3 logic |
| `app/api/today/route.ts` | Load 28 days; compute training load; pass options; call scoreAudit |
| `app/api/debug/route.ts` | Surface `recentAudit` rows; 28-day stored snapshot window |
| `components/views/TodayView.tsx` | Confidence chip on readiness hero |

## Unchanged (reused without modification)

`Reflection`, `CheckIn`, `UserSettings`, `WorkoutSession`, `DailyHealthSnapshot`
schema, `loadSnapshots` (`days` arg was already there), `app/api/weekly`,
`app/api/chat`, `app/api/strategy`, `lib/guardrails.ts`, `lib/ai/aiContext.ts`.

---

## Quantified improvements

| Defect (v1) | Fix | Expected impact |
|---|---|---|
| Morning step penalty | Phase 1a: same-day neutral | Score at 9am more closely reflects recovery, not time-of-day. Mornings no longer unfairly capped to Maintain when sleep/HRV say Push. |
| Noise-reactive HRV/RHR | Phase 2: z-scores | A ±5ms HRV fluctuation within 1 SD of your norm no longer moves the score. Real deviations (≥1 SD) are scored proportionally to their rarity — signal/noise ratio improves substantially over ~28 days. |
| Unused sleep stage data | Phase 1c: deep+REM factor | High-quality nights (≥35% deep+REM) can earn up to +2pts; fragmented nights penalized −1pt within existing budget. |
| Silent neutral substitution | Phase 1b: confidence | Score carries an explicit accuracy signal. You know when to trust vs. treat as directional only. |
| No training load awareness | Phase 3: ACWR | Back-to-back hard days start dampening the score even when sleep/HRV look normal. Taper periods get a small upward adjustment. Activates ~Day 28. |
| No score history | Phase 0: ScoreAudit | Every day's score is now inspectable. Foundation for Phase 4 reflection-based calibration. |

## When does each improvement activate?

| Improvement | Activates |
|---|---|
| Phase 0 (audit) | Immediately — silently writes on every dashboard load |
| Phase 1a (step fairness) | Immediately |
| Phase 1b (confidence) | Immediately |
| Phase 1c (sleep stages) | Immediately when Fitbit syncs stage data |
| Phase 2 (z-scores, HRV) | When `nHrv ≥ 14` AND `sdHrv ≥ 3ms` — typically ~Day 21–28 |
| Phase 2 (z-scores, RHR) | When `nRestingHr ≥ 14` AND `sdRestingHr ≥ 0.8bpm` |
| Phase 3 (training load) | When `≥ 14` days with active-minutes data in chronic window |

---

## Phase 4 (future — not yet built)

Requires ~20+ reflections stored in `Reflection` + `ScoreAudit` history.
Will compare predicted day type vs. reflection outcome and apply bounded weight nudges.
The `ScoreAudit` table built in Phase 0 is the prerequisite data source.
