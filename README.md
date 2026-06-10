# FitAI

Recovery-aware productivity and fitness assistant. Pulls health data from your
Fitbit (via Google Health API), computes a daily readiness score, and
recommends whether today is a **Push**, **Maintain**, or **Recover** day —
for both training and study/work decisions.

---

## Project overview

**Target user:** You (personal project, not public SaaS)  
**Primary goal:** Balance study/work performance and 4–5x/week training  
**Core output:** Push / Maintain / Recover day type + key health trends  
**Data trust model:** Subjective check-in first, wearable as corroborating signal  
**Wearable:** Fitbit (3+ days old; baselines improve over 7–14 days)

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Auth | NextAuth.js v5 beta (Google OAuth 2.0) |
| Health data | Google Health API v4 |
| Database | SQLite (Prisma 7 + better-sqlite3 adapter) |
| Runtime | Node.js (local dev) |

---

## Setup

### 1. Prerequisites

- **Google Cloud Console** — [console.cloud.google.com](https://console.cloud.google.com)
  - Enable the **Google Health API**
  - Configure OAuth consent screen (External, add your email as a Test user)
  - Create an **OAuth 2.0 Client ID** (Web application)
  - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...          # openssl rand -base64 32
AUTH_URL=http://localhost:3000
DATABASE_URL="file:./prisma/dev.db"
```

### 3. Database

```bash
npm run db:migrate       # creates prisma/dev.db and applies schema
npm run db:generate      # regenerates Prisma client (after schema changes)
```

### 4. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect with Google**,
approve health data scopes, and you'll land on `/dashboard`.

---

## How it works

On each dashboard load the app:

1. **Syncs** the last 7 days of health data from Google Health API into SQLite
2. **Normalizes** raw API responses into clean daily snapshots
3. **Computes baselines** — rolling averages over available prior days
4. **Shows deltas** — today vs baseline, with "forming" state when data is thin

---

## Data model

### Tracked metrics (Phase 2A)

| Metric | Source | Notes |
|---|---|---|
| Sleep duration | Google Health API | minutes |
| Sleep efficiency | Google Health API | 0–100 % |
| Sleep stages | Google Health API | deep / REM / light minutes |
| Resting heart rate | Google Health API | bpm |
| HRV | Google Health API | daily ms average |
| Steps | Google Health API | daily count |
| Active minutes | Google Health API | daily |

**Deferred:** stress score (calibrating), SpO2, respiratory rate, sleep temperature, distance, raw intraday HR

### Database tables

**`DailyHealthSnapshot`** — one row per user per date  
**`CheckIn`** — morning check-in (Phase 2B, schema defined, UI not yet built)

---

## Roadmap

### ✅ Phase 1 — Data pipeline (complete)
- Google OAuth via NextAuth v5
- Google Health API integration
- Live data on dashboard

### ✅ Phase 2A — Data foundation (complete)
- Narrowed to 5 core metrics (sleep, RHR, HRV, steps, active minutes)
- SQLite database with Prisma 7
- 7-day history fetch and upsert on every load
- Rolling baselines with "forming" state for new devices
- Today vs baseline deltas per metric
- Sparklines in dashboard UI

### 🔜 Phase 2B — Core product loop
- Morning check-in (4 sliders: energy, stress feel, sleep quality, motivation)
- Readiness score (0–100): 40% subjective, 40% sleep + HRV/RHR, 20% activity
- Push / Maintain / Recover day type
- Rest day recommendation for training
- "Why today?" explanation panel
- Proposal2 UI skin (Today view + Check-in + Trends)

### Phase 2C — Trends & night reflection
- 7-day sparkline charts
- Night reflection ("Was today's recommendation accurate?")
- Feedback loop to tune weights over time

### Phase 3 — Intelligence (later)
- LLM-generated daily plan text
- Stress score integration (when Fitbit calibrates)
- Calendar / deadline integration
- Push notifications
- Vercel deployment

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/sync` | POST | Sync 7 days, return baseline data |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth OAuth handlers |

---

## Notes

- Google Health API scopes are **Restricted** — keep OAuth app in Testing mode and add yourself as a test user.
- Fitbit data must be synced to your Google account (open the Fitbit app and sync first).
- Baselines marked "forming" until 5+ days of data exist; readiness scores meaningful after ~7–14 days of wear.
- All metrics nullable — the app handles missing data gracefully.
