# FitAI — Features

Concise inventory of what is built today.

---

## Core

- Daily **Push / Maintain / Recover** day type from readiness score
- **Readiness score** (0–100): subjective check-in + objective wearables + activity
- **Subjective-first** — check-in overrides wearable signals when they conflict
- Personal use: 4–5x/week training + study/work balance

---

## Auth & data

- Google OAuth sign-in (NextAuth v5)
- Google Health API sync (Fitbit → Google Health → FitAI)
- Auto-sync last **7 days** on dashboard load
- SQLite persistence (Prisma) — history kept across sessions
- Null-safe upserts — failed syncs don’t overwrite good data
- OAuth token auto-refresh
- Rolling **7-day baselines** with **forming** state for new devices

---

## Metrics

| Live | Notes |
|---|---|
| Sleep duration, efficiency, stages (deep/REM/light) | |
| Resting heart rate | |
| HRV | Requires full tracked sleep + stages |
| Steps | |
| Active minutes | Pulled; lightly used in UI |

**Deferred:** stress score, SpO2, respiratory rate, sleep temperature, distance

---

## Dashboard — Today

- Readiness ring + day type badge
- Key signals grid (sleep, RHR, HRV, energy or steps)
- **Why today?** panel — reasons with sentiment tags
- Descriptive empty states (Pending, Processing, Calibrating, etc.)
- Check-in nudge / summary
- **AI Strategy panel** (see below)

---

## Dashboard — Check-In

- 4 sliders (1–10): energy, sleep quality, stress, motivation
- Saved to DB; feeds readiness scoring

---

## Dashboard — Trends

- 7-day sparklines: sleep, RHR, HRV, steps
- Day-type dots per day (Push / Maintain / Recover)
- Shared empty-state copy with Today view

---

## AI Strategy (Gemini 2.5 Flash)

| Action | Purpose |
|---|---|
| **Explain** | Why today’s day type, citing real numbers |
| **Adjust Day** | Prioritise up to 5 tasks (Keep / Reduce / Move / Avoid) |
| **Protect Tomorrow** | Tonight’s actions; minimum useful day on Recover |

- Streaming prose + structured cards
- Tab caching, regenerate, confidence badge
- Requires `GEMINI_API_KEY` in `.env.local`

---

## API

| Route | Purpose |
|---|---|
| `GET /api/today` | Sync + snapshot + check-in + readiness |
| `POST/GET /api/checkin` | Save / retrieve check-in |
| `POST /api/strategy` | AI coaching (SSE stream) |
| `POST /api/sync` | Manual sync |
| `GET /api/debug` | Session, raw API, DB inspection |
| `/api/auth/[...nextauth]` | OAuth |

---

## UI

- Proposal2 design — light, glassy, minimal dashboard
- Ionicons (react-icons); sidebar nav, hero card, signal cards, trend charts

---

## Not built yet

- Night reflection / feedback loop
- 14-day trends
- Stress score integration
- Calendar / deadlines
- Push notifications
- Production deployment
