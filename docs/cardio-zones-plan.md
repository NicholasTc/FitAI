# Cardio Zones — Karvonen Zone 1–4 Implementation Plan

> Replaces the Fitbit consumer-branded "Fat Burn / Cardio / Peak" cardio zones card with a
> genuinely science-grounded Zone 1–4 model (Light / Moderate / Vigorous / Peak), computed
> by Fitbit via the Karvonen Heart-Rate-Reserve algorithm and already available through
> Google Health API data types this app has never fetched. Additive — nothing existing is
> removed or broken; every new field is nullable and falls back cleanly.

---

## Why

"Fat Burn" zone naming is a fitness-marketing artifact, not exercise science. At lower
intensity you burn a higher *percentage* of calories from fat, but fewer *total* calories
(and less total fat) than at higher intensity for equivalent effort — the "fat-burning
zone" doesn't mean what the name implies. Exercise physiology talks in %HRmax / %HR-reserve
intensity bands, which is exactly what Google Health API's `daily-heart-rate-zones` and
`time-in-heart-rate-zone` data types already expose, under honest labels
(`LIGHT` / `MODERATE` / `VIGOROUS` / `PEAK`) — we're just not fetching them yet.

---

## Findings — verified against the live API, not assumed

All of the below was confirmed directly against Google's discovery document
(`https://health.googleapis.com/$discovery/rest?version=v4`) and the raw
`developers.google.com/health/data-types` table, not inferred.

| Question | Answer | Source |
|---|---|---|
| Does a real zone-science data type exist? | Yes — `daily-heart-rate-zones` (per-day personalized bpm boundaries) and `time-in-heart-rate-zone` (actual time-in-zone intervals) | `DailyHeartRateZones`, `HeartRateZone`, `TimeInHeartRateZone` schemas |
| How many zones, and named how? | 4: `LIGHT`, `MODERATE`, `VIGOROUS`, `PEAK` — computed via the **Karvonen algorithm** (Heart Rate Reserve method), per Google's own schema description | `HeartRateZone.heartRateZoneType` enum |
| Does it give bpm boundaries? | Yes — `minBeatsPerMinute` / `maxBeatsPerMinute` per zone, personalized per user per day | `HeartRateZone` schema |
| Does `time-in-heart-rate-zone` support raw (sub-day) queries, or only a daily total? | Supports `list, reconcile, rollup, dailyRollup` — full interval-level querying, not rollup-only (an earlier search result claiming rollup-only was wrong; verified against the primary data-types table row) | `data-types` page, row `time-in-heart-rate-zone` |
| New OAuth scopes needed? | **No.** `daily-heart-rate-zones` requires `health_metrics_and_measurements`; `time-in-heart-rate-zone` requires `activity_and_fitness`. Both are already in `REQUIRED_HEALTH_SCOPES` (`lib/auth.ts`) — no re-consent, no Cloud Console change. | `data-types` page scope column |
| Query range limits? | `time-in-heart-rate-zone` and `daily-heart-rate-zones` get the standard **90-day** window (not the 14-day cap that applies to raw `heart-rate` samples) — cheap to extend into a weekly/monthly trend later. | `data-types` page "Query range limits" note |
| Is this "real time"? | Bounded by Fitbit's own device→cloud sync cadence: **~15 minutes** while the Fitbit app is open and Bluetooth-connected, **hourly** for phone-only MobileTrack tracking. Identical freshness ceiling to every other metric this app already shows (sleep, RHR, HRV, steps) — not literal live streaming, but no worse than what's already shipped. | `data-types` page "Data availability" note |

**What the app fetches today:** only `active-zone-minutes` (`lib/health.ts` →
`ActiveZoneMinutesRollup`) — Fitbit's own `FAT_BURN` / `CARDIO` / `PEAK` gamified metric.
That is the direct source of the current "Fat Burn / Cardio / Peak" card. `daily-heart-rate-zones`
and `time-in-heart-rate-zone` are not fetched anywhere in the codebase today (confirmed by
repo-wide search).

---

## Decisions (confirmed with Nicholas)

1. **Zone count:** show all 4 real zones as **Zone 1–4** (Light/Moderate/Vigorous/Peak) — no
   information thrown away by collapsing to 3.
2. **Show bpm ranges:** yes — e.g. "Zone 2 · 118–137 bpm — 22 min", using the new
   `daily-heart-rate-zones` data. This is the most direct way to make the card read as
   scientifically grounded rather than a colored bar.
3. **Weekly WHO-guideline targets** (150 min moderate / 75 min vigorous, currently in
   `lib/zoneMinutes.ts`): **keep**, re-sourced from the new zones instead of AZM. Same
   feature, same output shape, better-sourced input.

---

## What already exists (reuse, do not recreate)

- `lib/health.ts` — the exact request/parse pattern to copy (`dailyRollUp<T>`, coercion
  helpers `toInt`/`toFloat`, the `ActiveZoneMinutesRollup` fetch as a direct template).
- `lib/sync.ts` — `upsertSnapshot`'s null-safe `nz()` update pattern (a failed/missing sync
  never overwrites a previously-stored good value).
- `lib/zoneMinutes.ts` — the weekly moderate/vigorous target math, day/week aggregation,
  and `WeeklyZoneMinutes` output shape. Only the **input mapping** changes.
- `types/snapshot.ts` / `prisma/schema.prisma` — `DailyHealthSnapshot` already has
  `fatBurnMin`/`cardioMin`/`peakMin`; new fields sit alongside them, additive.
- `lib/metricStatus.ts` — the established "Pending / Not available / Calibrating" empty-state
  pattern, reused for the zone card instead of inventing new copy.
- `components/views/HealthView.tsx` — existing Cardio Zones card layout (progress bars,
  legend dots) — restyled in place, not rebuilt.

## What's missing (net new)

| Artifact | Type | Notes |
|---|---|---|
| `daily-heart-rate-zones` fetch | **NEW** (in `lib/health.ts`) | `dailyRollUp` call, mirrors AZM fetch |
| `time-in-heart-rate-zone` fetch | **NEW** (in `lib/health.ts`) | `dailyRollUp` call, mirrors AZM fetch |
| `ZoneBreakdown` type | **NEW** (in `lib/health.ts` / `types/snapshot.ts`) | 4 zones × {minutes, minBpm, maxBpm} |
| `zoneLightMin` … `zonePeakMin` | **NEW** columns on `DailyHealthSnapshot` | nullable Int, minutes per zone |
| `zoneLightMinBpm/MaxBpm` … `zonePeakMinBpm/MaxBpm` | **NEW** columns on `DailyHealthSnapshot` | nullable Int, personalized bpm boundaries |
| Karvonen-sourced mapping in `computeWeeklyZoneMinutes` | **EXTEND** (`lib/zoneMinutes.ts`) | Moderate→moderate target; Vigorous+Peak→vigorous target. Falls back to legacy `fatBurnMin/cardioMin/peakMin` mapping when new fields are null (e.g. days synced before this ships) |
| Zone 1–4 card | **EXTEND** (`components/views/HealthView.tsx`) | relabel + bpm range display |

**Unchanged:** `active-zone-minutes` fetch/storage stays as-is (it drives Fitbit's own
"Active Zone Minutes" gamification concept, which is a separate, legitimate feature some
users rely on) — it simply stops being the source for the Cardio Zones card.

---

## Safety / rollback

- Every new column is **nullable** — a day synced before this ships, or a sync that only
  partially succeeds, has `null` zone fields and the UI falls back to the existing
  `metricStatus`-style "Pending" treatment, never fabricated data.
- `computeWeeklyZoneMinutes` keeps its exact current function signature and output shape —
  no caller elsewhere in the app needs to change.
- If Karvonen zone fields are null for a given day, `lib/zoneMinutes.ts` falls back to the
  legacy `fatBurnMin/cardioMin/peakMin` mapping for that day only — mixed-source weeks (some
  days old data, some days new) still produce a sane weekly total instead of a gap.

---

## Verification

1. After a sync, open `/api/debug` (or the equivalent inspection surface) and confirm
   `daily-heart-rate-zones` and `time-in-heart-rate-zone` responses are non-empty for today.
2. Confirm the four bpm ranges returned are personalized (not identical to a generic default)
   and internally consistent (Zone 1 min < Zone 1 max = Zone 2 min, etc., strictly increasing).
3. Log a workout and confirm the day's Zone 3/4 minutes move — should qualitatively track the
   old Cardio+Peak minutes for the same session (directionally consistent, not necessarily
   identical since the underlying zone boundaries differ from AZM's).
4. Confirm the weekly moderate/vigorous progress bars still compute against `UserSettings`
   weekly targets unchanged.

---

## Build order

1. `lib/health.ts` — new fetches + parsing (this doc's task 2)
2. Schema + `types/snapshot.ts` (task 3), then `db:generate` / migrate
3. `lib/sync.ts` upsert wiring (task 4)
4. `lib/zoneMinutes.ts` re-source (task 5)
5. `HealthView.tsx` card update (task 6)
6. `docs/features.md` + end-to-end verification (task 7)
