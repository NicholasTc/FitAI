# History Calendar — Implementation Plan

> Reflection-first calendar showing **all manual log history** in the app.
> Wearable metrics are **context only** when available — never invented.
> Every item is tagged: **EXTEND** (modify existing) or **NEW** (create new).

---

## Product goal

Give you a single place to browse **everything you manually recorded** — not just the last 7 days — and reflect on how days actually went vs what the app recommended.

The calendar is a **journal index**, not a longer Trends chart.

---

## Manual logging sources (scope of this feature)

These are the only user-entered records the calendar must surface. All are already in Postgres.

| Source | Model | What the user logs | Per-day cardinality |
|---|---|---|---|
| **Morning check-in** | `CheckIn` | Energy, stress, sleep quality, motivation (1–10 sliders) | 1 per day max |
| **Night reflection** | `Reflection` | Accuracy (yes/somewhat/no), outcome (great/good/skipped/rest), optional note | 1 per day max |
| **Workout log** | `WorkoutSession` (`isManual=true`) | Type, duration, RPE → `sessionLoad` | 0–N per day |

**Not manual logging** (context only on day detail, when stored):

| Source | Model | Notes |
|---|---|---|
| Wearable sync | `DailyHealthSnapshot` | Google Health API — may be missing for old days |
| Readiness audit | `ScoreAudit` | App-computed score/day type at time of load — use for past day type, don't recompute |

**Out of scope for v1:** Settings changes, AI chat transcripts, strategy outputs (not persisted per day today).

---

## Current state (relevant gaps)

| Area | Today | Gap |
|---|---|---|
| **Trends view** | 7-day sparklines from `TodayState.history` | Chart-focused; no reflections or workouts |
| **This Week** | `GET /api/weekly` — 7 days | Hardcoded window; table duplicates what calendar would do better |
| **Reflect view** | Today only (`GET /api/reflection?date=`) | Can't browse or edit past reflections from UI |
| **Workout log** | `GET /api/workout` — last **28 days** | Not full manual history |
| **Check-in API** | Per-date GET/POST | No list/range endpoint |
| **Health sync** | `SYNC_DAYS = 7` in `lib/sync.ts` | Older wearable rows only exist if previously synced |
| **ScoreAudit** | Written on each `/api/today` load | Exists for days you opened the app; best source for historical day type |

---

## Design principles

1. **Manual logs are the calendar's spine.** A day appears on the calendar if it has ≥1 manual record (check-in, reflection, or workout). Wearable-only days are optional to show (configurable filter; default: show manual days only).
2. **All manual history, no cap.** Check-ins, reflections, and workouts query the full DB range — not limited to 30 days. Month navigation paginates backward as far as data exists.
3. **No mock data.** If wearables weren't synced for an old day, day detail shows manual logs + "Health data not synced for this day" — not fabricated metrics.
4. **Past day type from `ScoreAudit`.** Don't re-run today's readiness algorithm on old days (logic changes over time). Use stored `score` + `dayType` when audit row exists; otherwise show "Not recorded."
5. **Reflection-first day detail.** Note text and accuracy/outcome are prominent; metrics and score are supporting context.
6. **Edit in place.** User can update past reflection and check-in from day detail (upsert APIs already exist). Workouts: delete + re-log (DELETE exists on `/api/workout`).

---

## Phase 1 — History data layer

**Goal:** One API that returns calendar-ready data for any month, merging all manual sources.

### 1.1 NEW `types/history.ts`

```typescript
export interface HistoryDaySummary {
  date: string; // YYYY-MM-DD

  // Manual log flags (drive calendar visibility)
  hasCheckIn: boolean;
  hasReflection: boolean;
  hasWorkout: boolean;
  manualLogCount: number; // check-in (0|1) + reflection (0|1) + workout count

  // App recommendation at time (from ScoreAudit — nullable)
  dayType: "push" | "maintain" | "recover" | null;
  readinessScore: number | null;

  // Compact preview for calendar cell tooltips
  reflectionAccuracy: "yes" | "somewhat" | "no" | null;
  workoutCount: number;
}

export interface HistoryDayDetail extends HistoryDaySummary {
  checkIn: CheckInData | null;
  reflection: ReflectionData | null;
  workouts: Array<{
    id: string;
    typeLabel: string;
    durationMinutes: number;
    rpe: number;
    sessionLoad: number;
  }>;
  // Wearable context — only when DailyHealthSnapshot row exists
  snapshot: {
    sleepMinutes: number | null;
    hrv: number | null;
    restingHr: number | null;
    steps: number | null;
    totalCalories: number | null;
  } | null;
  scoreAudit: {
    score: number;
    dayType: string;
    method: string;
    dataCompleteness: number;
  } | null;
}
```

### 1.2 NEW `lib/history.ts`

Pure aggregation helpers (no HTTP):

- `buildManualDateIndex(checkIns, reflections, workouts) → Set<string>` — all dates with manual activity
- `summarizeDay(date, ...) → HistoryDaySummary`
- `detailDay(date, ...) → HistoryDayDetail`

Query pattern for a month `YYYY-MM`:

1. Parallel DB fetches for `userId` + date range `[monthStart, monthEnd]`:
   - `checkIn.findMany`
   - `reflection.findMany`
   - `workoutSession.findMany({ isManual: true })`
   - `scoreAudit.findMany` (optional join for day type)
   - `dailyHealthSnapshot.findMany` (context only)
2. Union dates from manual tables → calendar days
3. Attach audit + snapshot when present

For **"all history"** month discovery: query `SELECT DISTINCT date` union across the three manual tables, grouped by month — used to enable/disable prev-month navigation.

### 1.3 NEW `GET /api/history`

```
GET /api/history?month=2026-06        → month grid summaries
GET /api/history?date=2026-06-15      → single day detail
GET /api/history/bounds               → { earliestDate, latestDate } from manual logs
```

**`?month=YYYY-MM` response:**

```json
{
  "month": "2026-06",
  "earliestManualDate": "2025-11-03",
  "latestManualDate": "2026-06-17",
  "days": [ /* HistoryDaySummary[] — only days with manual activity by default */ ],
  "stats": {
    "reflectionsSubmitted": 12,
    "checkInsSubmitted": 18,
    "workoutsLogged": 9,
    "accuracyYes": 8,
    "accuracySomewhat": 3,
    "accuracyNo": 1
  }
}
```

Query param `includeWearableOnly=true` (optional, default false): also include days that only have `DailyHealthSnapshot` + `ScoreAudit` but no manual log. **Off by default** — keeps calendar focused on your journal.

**`?date=YYYY-MM-DD` response:** `HistoryDayDetail`

**`/bounds` response:** earliest/latest date across all three manual tables — drives "you have logs back to Nov 2025" copy and prev-button disable logic.

### 1.4 EXTEND manual log APIs (remove artificial caps)

| Route | Change |
|---|---|
| `GET /api/workout` | Add `?since=YYYY-MM-DD` (optional). **No since = all manual sessions**, ordered `date DESC`. Keep 28-day default only if `since` omitted AND `?window=28` passed for backward compat with WorkoutLogView — or update WorkoutLogView to pass `since` explicitly. |
| `GET /api/reflection` | Add `GET /api/reflection?since=&until=` for range (or rely solely on `/api/history`) |
| `GET /api/checkin` | **NEW** range list if not exists — check current route; add `?since=&until=` |

Prefer **one history API** for the calendar; extend individual routes only if WorkoutLogView needs them independently.

### 1.5 EXTEND `lib/sync.ts` — wearable backfill on History open

When user opens History view (or requests a month >7 days ago):

- **EXTEND** `syncUserSnapshots(userId, token, today, days?)` — optional `days` param (default 7, max 90)
- On History mount: trigger `POST /api/sync?days=30` (or 90) **best-effort** to backfill wearable context for day detail — does not block calendar render
- Manual logs render immediately from DB; wearables fill in async

**Cap backfill at 90 days** for API rate limits — document this. Manual history remains unlimited.

### 1.6 Verification (Phase 1)

- Log check-in + reflection + workout on 3 different days
- `GET /api/history/bounds` returns correct earliest date
- `GET /api/history?month=...` returns all 3 days with correct flags
- `GET /api/history?date=...` returns full detail; snapshot null when never synced
- Day with only workout (no reflection) still appears

---

## Phase 2 — Calendar UI

**Goal:** Month grid navigable back to first manual log; visual scan of journal activity.

### 2.1 NEW `components/views/HistoryView.tsx`

Replace or supplement "This Week" — recommendation: **rename nav "This Week" → "History"** and evolve `WeeklyView` into this, OR add new nav item and deprecate weekly table later.

**Layout:**

```
┌─────────────────────────────────────────┐
│  ← June 2026 →          [This month ▾]  │
├─────────────────────────────────────────┤
│  Mo Tu We Th Fr Sa Su                   │
│  ·  ·  ·  ·  ·  1  2                    │
│  3  4  5  6  7  8  9   ← cells with     │
│  ...                     manual logs     │
│                                         │
│  Legend:                                │
│  ● Reflection  ○ Check-in  ▪ Workout    │
│  ■ Push  ■ Maintain  ■ Recover (audit)  │
└─────────────────────────────────────────┘
```

**Cell rendering rules:**

| Signal | Visual |
|---|---|
| Has reflection | Filled dot (color by accuracy: green/amber/red) |
| Has check-in, no reflection | Hollow dot |
| Has workout(s) | Small barbell icon or dot count if multiple |
| `ScoreAudit.dayType` | Subtle background tint on cell (push/maintain/recover) |
| Today | Ring outline |
| Selected | Bold border |

Empty cells (no manual log): muted, not clickable — unless `includeWearableOnly` filter on.

**Month navigation:**

- Prev/next month buttons
- Disable prev when before `earliestManualDate`
- Dropdown: jump to month (last 12 months with data)

### 2.2 EXTEND `components/AppShell.tsx`

- Add/rename nav: **History** (icon: `week` or new `calendar` icon in `types/icons.ts` + `AppIcon.tsx`)
- Render `HistoryView` — no dependency on `/api/today` loading (like Settings / WorkoutLogView)

### 2.3 Month-level stats bar (below grid)

Compact row reusing weekly stats patterns:

- Reflections this month: N
- Recommendation accuracy: X% "yes"
- Workouts logged: N
- Check-ins: N

All computed server-side in `/api/history?month=`.

### 2.4 Verification (Phase 2)

- Navigate to month with old workout logs — all appear
- Cell colors match day type from audit
- Empty months show "No logs this month"
- Mobile: grid scrollable; tap cell opens detail (Phase 3)

---

## Phase 3 — Day detail panel

**Goal:** Tap a day → see full manual record + context; edit where supported.

### 3.1 NEW `components/views/HistoryDayPanel.tsx`

Slide-over (mobile) or right panel (desktop). Sections in order:

1. **Header** — formatted date, day type chip + score (from `ScoreAudit`, or "Not recorded")
2. **Reflection** (priority)
   - If exists: accuracy, outcome, note (rendered prominently)
   - If missing: "No reflection — add one" → inline form (reuse `ReflectionView` field components)
   - Edit button → same form pre-filled (POST upsert)
3. **Morning check-in**
   - If exists: 4 slider values as labeled chips
   - If missing: link to check-in form for that date (EXTEND `CheckInView` to accept `date` prop)
4. **Workouts**
   - List all manual sessions that day (type, duration, RPE, session load)
   - Delete per session (existing DELETE `/api/workout?id=`)
   - "Log another session" → mini form or link to WorkoutLogView with date pre-filled
5. **Health context** (collapsed by default)
   - Only if `snapshot` non-null: sleep, HRV, RHR, steps, calories
   - If null: "Wearable data wasn't synced for this day."
6. **Score breakdown** (collapsed, advanced)
   - If `scoreAudit` exists: method, confidence, link-style expand of breakdown JSON (or formatted sub-scores)

### 3.2 EXTEND `CheckInView.tsx`

- Accept optional `date` prop (default today)
- POST to `/api/checkin` with that date — enables logging/editing check-in for past days from History

### 3.3 EXTEND `ReflectionView.tsx`

- Accept optional `date` prop (already has date in API — wire through for past-day edit from History)

### 3.4 EXTEND `WorkoutLogView.tsx`

- Accept optional `initialDate` query/hash param when navigated from History

### 3.5 Verification (Phase 3)

- Tap day with all 3 manual types → all sections populated
- Edit reflection note → saves, calendar cell updates
- Delete workout → cell workout indicator updates
- Day with only reflection, no wearables → no fake metrics shown

---

## Phase 4 — Insights (optional, after v1 stable)

**Goal:** Patterns across **all** reflection history — not just current month.

### 4.1 NEW insights section in HistoryView (bottom)

- **Accuracy over time** — % "yes" per month (bar chart, only months with ≥3 reflections)
- **Filter calendar** — show only days where `accuracy === "no"` (learn from misses)
- **Workout load trend** — monthly total `sessionLoad` from manual workouts

### 4.2 EXTEND `lib/scoreAudit.ts` / future feedback loop

- Compare `ScoreAudit.dayType` vs `Reflection.accuracy` across all history
- Surface in insights: "Recover days marked accurate 85% of the time"
- **Do not auto-tune weights yet** — display only (matches readiness accuracy plan Phase 4 intent)

---

## API summary

| Route | Type | Purpose |
|---|---|---|
| `GET /api/history?month=YYYY-MM` | NEW | Month calendar summaries |
| `GET /api/history?date=YYYY-MM-DD` | NEW | Single day detail |
| `GET /api/history/bounds` | NEW | Earliest/latest manual log dates |
| `POST /api/sync?days=30` | EXTEND | Backfill wearables for history context |
| `GET /api/workout` | EXTEND | All manual sessions (remove 28-day cap) |
| `GET /api/checkin` | EXTEND | Range query if needed |

---

## DB / index considerations

Current indexes are sufficient for single-user scale:

- `CheckIn`: `@@index([userId])` + filter by date range
- `Reflection`: `@@index([userId])`
- `WorkoutSession`: `@@index([userId, date])`

**Optional later** (only if slow): `@@index([userId, date])` on `CheckIn` and `Reflection`.

No schema changes required for v1.

---

## What to NOT build in v1

| Item | Reason |
|---|---|
| Google Calendar / deadlines integration | Different product; scope creep |
| AI summary of past month | Nice later; needs persisted strategy outputs |
| Recompute readiness for all past days | Invalidates comparability; use `ScoreAudit` |
| Show wearable-only days by default | Dilutes journal focus |
| Infinite auto-sync of all Fitbit history | API limits; 90-day backfill on History open is enough |
| Individual exercise breakdown in workouts | Explicitly out of scope per workout plan |

---

## Relationship to existing views

| View | After this ships |
|---|---|
| **Trends** | Keep — 7-day metric charts (operational dashboard) |
| **This Week** | Deprecate or merge into History month stats — avoid two tables |
| **Reflect** | Keep as today's quick entry; History handles past days |
| **Workout log** | Keep as logging UX; History handles browsing |

---

## Build order

```
Phase 1 (API + sync backfill)  →  Phase 2 (calendar grid)  →  Phase 3 (day detail + edit)
                                                                      ↓
                                                              Phase 4 (insights) optional
```

**Do not build UI before Phase 1** — calendar must only show real manual data.

Estimated touch points:

| Artifact | Type | Phase |
|---|---|---|
| `types/history.ts` | NEW | 1 |
| `lib/history.ts` | NEW | 1 |
| `app/api/history/route.ts` | NEW | 1 |
| `lib/sync.ts` — optional `days` param | EXTEND | 1 |
| `app/api/sync/route.ts` — `days` query param | EXTEND | 1 |
| `app/api/workout/route.ts` — full history | EXTEND | 1 |
| `components/views/HistoryView.tsx` | NEW | 2 |
| `components/views/HistoryDayPanel.tsx` | NEW | 3 |
| `components/AppShell.tsx` — nav | EXTEND | 2 |
| `CheckInView.tsx` — past date | EXTEND | 3 |
| `ReflectionView.tsx` — past date | EXTEND | 3 |
| `WorkoutLogView.tsx` — `initialDate` | EXTEND | 3 |
| `types/icons.ts` + `AppIcon.tsx` — calendar icon | EXTEND | 2 |
| `docs/features.md` | EXTEND | 4 |

**Unchanged:** `lib/readiness.ts`, `lib/trainingLoad.ts`, `ScoreAudit` write path, AI routes, guardrails.

---

## Success criteria

1. Every manual check-in, reflection, and workout ever logged appears on the calendar — no time cap.
2. Tapping a day shows reflection note as the primary content.
3. Wearable metrics appear only when actually stored — never mocked.
4. Past day type comes from `ScoreAudit`, not a recomputed score.
5. You can edit a reflection or check-in from 2+ months ago without leaving History.
6. Opening History triggers a best-effort 30-day wearable backfill so recent day detail has context.

---

## Open decisions (confirm before build)

1. **Nav label:** "History" vs "Journal" vs evolve "This Week" in place?
2. **Wearable-only days:** hidden by default (recommended) — show toggle?
3. **Backfill window:** 30 vs 90 days on History open?
4. **Weekly view:** remove entirely or keep as a "current week" shortcut inside History?
