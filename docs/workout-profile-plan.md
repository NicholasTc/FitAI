# Workout Logging + Profile Data — Implementation Plan

> Phases A, B, C. Grounded in the actual codebase.
> Every item is tagged: **EXTEND** (modify existing) or **NEW** (create new).
> Nothing is created that already exists.

---

## Current state (relevant to this plan)

- `UserSettings` model: `wakeTime`, `sleepTargetTime`, `deepWorkLabel`, `lightWorkLabel` — **no profile fields yet**
- `app/api/settings/route.ts`: GET + PATCH — fully working, **extend both**
- `components/views/SettingsView.tsx`: renders 2 sections (Schedule, Work labels) — **extend UI**
- `types/today.ts` `UserSettings` interface: 4 fields — **extend**
- `WorkoutSession` model: exists but unused (API data unavailable from Fitbit) — **repurpose for manual logs**
- `lib/trainingLoad.ts`: uses `activeMinutes` from `DailySnapshot` as strain proxy — **extend to also accept manual load**
- `lib/readiness.ts`: `ReadinessOptions` accepts `trainingLoad` — **extend to accept `userProfile`**

---

## Phase A — User profile in Settings

**Goal:** Collect age, sex, height, weight. Use them to:
1. Compute BMR (Mifflin-St Jeor equation — most validated formula, ±10% accuracy)
2. Contextualise total calories relative to estimated expenditure
3. Tighten absolute HRV/RHR thresholds when baseline is still forming

### Research basis for each field
| Field | Why it matters for scoring |
|---|---|
| **Age** | HRV declines ~1ms/year after ~25 (Umetani 1998). Age-adjusts absolute thresholds when SD-gated z-scores haven't activated yet. |
| **Sex** | Women average ~5–10ms higher HRV than men (population studies). RHR norms also differ. |
| **Height + Weight** | Required for Mifflin-St Jeor BMR. Without both, height alone is not meaningful. |

### BMR formula (Mifflin-St Jeor, 1990)
```
BMR (men)   = 10 × weightKg + 6.25 × heightCm − 5 × age + 5
BMR (women) = 10 × weightKg + 6.25 × heightCm − 5 × age − 161
```
This gives daily resting expenditure. Total calories from Fitbit ÷ BMR gives an
activity multiplier — interpretable as "how active was today relative to just existing."

### What to build

**A1. EXTEND `UserSettings` model (prisma/schema.prisma)**
Add to existing `UserSettings`:
```
age        Int?    // years
sex        String? // "male" | "female" — affects BMR and HRV norms
heightCm   Float?  // centimetres
weightKg   Float?  // kilograms
```
These are all nullable — profile is optional and scoring degrades gracefully without it.

**A2. EXTEND `types/today.ts` `UserSettings` interface**
Add the same 4 fields (all optional: `number | null` or `string | null`).
Update `DEFAULT_SETTINGS` with `null` defaults.

**A3. EXTEND `app/api/settings/route.ts`**
- `GET`: include new profile fields in response (fall back to null)
- `PATCH`: accept and validate new fields (age: 10–99 int, heightCm: 100–250, weightKg: 20–300, sex: "male"|"female"|null)

**A4. EXTEND `components/views/SettingsView.tsx`**
Add a new "Profile" section (before Schedule) with:
- Age (number input)
- Sex (select: Male / Female / Prefer not to say)
- Height in cm (number input)
- Weight in kg (number input)
Reuses the existing `FieldRow`, `SettingsSection`, `INPUT_CLS` patterns — no new components.

**A5. NEW `lib/bmr.ts`**
Pure function: `computeBMR(profile) → number | null`
Returns null when any required field is missing.
Also exports `computeActivityMultiplier(totalCalories, bmr) → number | null`.

**A6. EXTEND `lib/readiness.ts`**
- Add `userProfile?: UserProfile` to `ReadinessOptions`
- When profile is present and baseline is forming: use age/sex-adjusted absolute thresholds
  for HRV and RHR instead of the current population-generic values
- Document the research source for each adjusted threshold inline

**A7. EXTEND `lib/ai/aiContext.ts`**
Add `bmr`, `activityMultiplier`, and `userProfile` (age, sex — not weight/height for privacy
in the prompt) to the context JSON so Gemini can interpret calorie data meaningfully.

**A8. db push + db:generate** (after schema change)

### Verification
After saving profile → open `/api/debug` → confirm `computedBaseline` still works.
Check that BMR is computable from the stored values.

---

## Phase B — Manual workout logging

**Goal:** Log sessions with type + duration + RPE.
Compute `sessionLoad = RPE × durationMinutes` (Foster 2001).
Use this as the strain input for the existing ACWR calculation in `lib/trainingLoad.ts`,
replacing the blunt `activeMinutes` proxy (which is null for most days anyway).

### Research basis
**Session RPE × Duration = Internal Training Load** (arbitrary units)
- Validated across strength training, running, cycling, team sports (Foster et al. 2001)
- Directly comparable across session types — unlike tracking reps/weights
- Correlates with blood lactate, oxygen consumption, and perceived fatigue
- Used by professional sports teams; not just an estimate
- **Sweet zone for ACWR: 0.8–1.3** (Hulin et al. 2016) — already implemented

### What to build

**B1. REPURPOSE (extend) `WorkoutSession` model (prisma/schema.prisma)**
The model already exists but is unused (API source never returned data).
Add manual-log fields and make API-specific fields optional:
```
// NEW fields
rpe             Int?    // 1–10 Rate of Perceived Exertion
sessionLoad     Int?    // computed: rpe × durationMinutes (arbitrary units)
isManual        Boolean @default(false) // distinguishes manual logs from API sync

// EXISTING fields that become optional for manual logs
startTime       String? // optional for manual (was required)
endTime         String? // optional for manual
typeRaw         String? // optional for manual (was required)
```
`typeLabel`, `durationMinutes`, `date`, `userId` stay required for both paths.

**B2. NEW `app/api/workout/route.ts`**
- `POST /api/workout`: create a manual workout log
  - Required: `date`, `typeLabel`, `durationMinutes`, `rpe`
  - Auto-compute: `sessionLoad = rpe × durationMinutes`
  - Validate: rpe 1–10, duration 1–300 min, date valid YYYY-MM-DD
- `GET /api/workout?since=YYYY-MM-DD`: list sessions for the user since a date

**B3. NEW `components/views/WorkoutLogView.tsx`**
Simple card with:
- Session type selector (Strength / Cardio / Mixed / Sport / Other)
- Duration (number input, minutes)
- RPE slider 1–10 with descriptive labels (1 = very easy, 10 = maximal effort)
- "Log session" button
- List of last 7 logged sessions (date, type, duration, RPE, session load)
Reuses existing `AppIcon`, `AppShell` nav patterns.

**B4. Add "Workout" to nav (AppShell.tsx)**
Existing nav pattern in `AppShell` — add one item, same pattern as Settings.

**B5. EXTEND `lib/trainingLoad.ts`**
- New function: `computeTrainingLoadFromManual(manualWorkouts: ManualWorkout[]) → TrainingLoadResult`
  - Acute: sum of `sessionLoad` in last 7 days / 7 (daily average)
  - Chronic: sum of `sessionLoad` in last 28 days / 28
  - Same ACWR ratio + modifier mapping as existing `computeTrainingLoad`
- Keep existing `computeTrainingLoad(priorHistory)` unchanged as fallback
- In `app/api/today/route.ts`: prefer manual load when ≥3 manual sessions exist,
  otherwise fall back to `activeMinutes`-based computation

**B6. EXTEND `app/api/today/route.ts`**
Load recent manual workouts alongside history — parallel fetch (same pattern as `loadLastWorkout`).
Pass to training load computation.

**B7. EXTEND `lib/ai/aiContext.ts`**
Add last 3 manual sessions (type, duration, RPE, session load, date) to the AI context
so Gemini can reason about cumulative fatigue.

**B8. db push + db:generate**

### Verification — the human test you wanted
1. Log "Strength, 60 min, RPE 8" → sessionLoad = 480
2. Open `/api/debug` next morning → check `recentAudit[0].breakdown.trainingLoad`
3. If you logged 3+ hard sessions this week, modifier should be negative
4. Verify it directionally matches how recovered you feel

This is directly observable without trusting the code.

---

## Phase C — Research-backed threshold refinement

**Goal:** Replace remaining hand-tuned thresholds with values grounded in published research.
Document each one with its source so every number is verifiable.

**Gate:** Do this *after* Phase A (profile data) because several thresholds are age/sex-adjusted.

### C1. EXTEND `lib/readiness.ts` — age/sex-adjusted absolute thresholds

When baseline is forming (< 14 days), we currently use generic absolute thresholds for HRV and RHR.
With profile data, replace these with age/sex-specific values:

**HRV absolute thresholds (when forming)**
Based on Nunan et al. 2010 (population RMSSD norms):
```
Male   18–35: ≥50ms = good, ≥35ms = ok, <35ms = low
Male   36–50: ≥42ms = good, ≥28ms = ok, <28ms = low
Male   51+:   ≥35ms = good, ≥22ms = ok, <22ms = low
Female 18–35: ≥55ms = good, ≥38ms = ok, <38ms = low
Female 36–50: ≥46ms = good, ≥30ms = ok, <30ms = low
Female 51+:   ≥38ms = good, ≥25ms = ok, <25ms = low
```
Without profile → keep current generic thresholds (unchanged fallback).

**RHR absolute thresholds (when forming)**
Based on American Heart Association athlete norms:
```
≤55 bpm → excellent (athlete range)
56–65   → normal/healthy
66–75   → acceptable
>75     → elevated
```
These don't change significantly with age/sex in athletic populations → keep current thresholds.

**Sleep stage thresholds (Phase 1c refinement)**
Based on Ohayon et al. 2004 (meta-analysis of sleep architecture norms):
```
Deep (N3): healthy = 13–23% of total sleep
REM:       healthy = 20–25% of total sleep
Combined:  healthy ≥ 33%
```
Current combined threshold is ≥35% for full bonus — tighten to ≥33% to match research.

### C2. EXTEND `lib/bmr.ts` — calorie context scoring

Add `scoreCalorieContext(totalCalories, bmr, dayType) → { label, isLow, isSurplus }`:
```
< 0.8 × BMR       → "Very low — below resting needs"  (flag for AI)
0.8–1.2 × BMR     → "Rest day range"
1.2–1.6 × BMR     → "Light activity"
1.6–2.0 × BMR     → "Moderate activity"
> 2.0 × BMR       → "High output day"
```
These multipliers are standard PAL (Physical Activity Level) ranges from FAO/WHO/UNU 2004.
Surface this context label in the Calories signal card on Today view.

### C3. Document all thresholds (update `lib/readiness.ts` header comments)
Every scoring constant gets an inline comment with:
- The value
- The source (author, year)
- What it represents

This is what lets you verify each number without trusting "the code told me so."

### What to NOT change in Phase C
- ACWR thresholds (0.8–1.3 neutral, >1.5 penalty) — already research-backed (Hulin 2016)
- z-score gates (n ≥ 14) — statistical minimum for stable SD, not arbitrary
- Score bucket totals (40/40/20) — changing these invalidates existing ScoreAudit history

---

## Net new artifacts (nothing redundant)

| Artifact | Type | Phase |
|---|---|---|
| Profile fields on `UserSettings` (schema + TS type) | EXTEND | A |
| Profile fields in `app/api/settings` | EXTEND | A |
| Profile section in `SettingsView` | EXTEND | A |
| `lib/bmr.ts` | NEW | A |
| Profile-aware absolute thresholds in `lib/readiness.ts` | EXTEND | A, C |
| Profile + BMR in `lib/ai/aiContext.ts` | EXTEND | A |
| `isManual`, `rpe`, `sessionLoad` on `WorkoutSession` | EXTEND | B |
| `app/api/workout/route.ts` | NEW | B |
| `components/views/WorkoutLogView.tsx` | NEW | B |
| Workout nav item in `AppShell` | EXTEND | B |
| `computeTrainingLoadFromManual()` in `lib/trainingLoad.ts` | EXTEND | B |
| Manual load fetch in `app/api/today/route.ts` | EXTEND | B |
| Manual sessions in `lib/ai/aiContext.ts` | EXTEND | B |
| Age/sex HRV thresholds in `lib/readiness.ts` | EXTEND | C |
| `scoreCalorieContext()` in `lib/bmr.ts` | EXTEND | C |
| Threshold source comments throughout `lib/readiness.ts` | EXTEND | C |

**Unchanged:** `Reflection`, `CheckIn`, `ScoreAudit`, `DailyHealthSnapshot`,
`lib/baseline.ts`, `lib/health.ts`, `lib/sync.ts`, `lib/guardrails.ts`,
`lib/scoreAudit.ts`, `app/api/today` core logic, all AI routes.

---

## Build order

1. **Phase A first** — profile data unlocks Phase C and improves calorie context for AI.
   Requires 1 schema change + db push.
2. **Phase B second** — workout logging is self-contained and immediately gives you
   a human-verifiable fatigue signal.
3. **Phase C last** — threshold refinement depends on profile data (Phase A) existing.
   Pure logic changes, no schema changes.
