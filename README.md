# FitAI

Recovery-aware productivity and fitness assistant.

## MVP Phase 1 — Google Health API Integration

This MVP connects to your Google account via OAuth and pulls Fitbit health data through the **Google Health API** (the replacement for the legacy Fitbit Web API).

### Prerequisites

1. **Google Cloud Console** — [console.cloud.google.com](https://console.cloud.google.com)
   - Create a project (e.g. `FitAI`)
   - **Enable** the **Google Health API** for that project
   - Configure **OAuth consent screen** (External, add your email as a **Test user**)
   - Create **OAuth 2.0 Client ID** (Web application)
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

2. Copy `.env.example` to `.env.local` and fill in credentials:

```bash
cp .env.example .env.local
```

Generate an auth secret:

```bash
openssl rand -base64 32
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect with Google**, approve health data access, and you'll land on `/dashboard` with live metrics.

### API routes

- `GET /api/auth/signin` — Google OAuth sign-in
- `GET /api/health/data` — Authenticated proxy returning all health metrics as JSON

### Notes

- Your Fitbit data must be synced to your Google/Fitbit account (open the Fitbit app on your phone and sync first).
- Google Health API scopes are **Restricted** — for personal MVP use, keep the OAuth app in **Testing** mode and add yourself as a test user.
- Some metrics require compatible Fitbit devices and may show unavailable.
- Phase 2 will add Push/Maintain/Recover decision logic.
