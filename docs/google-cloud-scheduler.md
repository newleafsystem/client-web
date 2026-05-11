# Google Cloud Scheduler

Production scanner jobs run as Node.js backend work triggered by Google Cloud Scheduler.
Cloudflare is not used for scheduling.

## Runtime Flow

```text
Google Cloud Scheduler
-> https://api.newleafsystem.com/api/internal/scheduler/{job}
-> server.cjs
-> scanner/run-scheduler-job.js
-> scanner pipeline scripts
-> R2 + Firestore
```

## Jobs

- `newleaf-scanner-fast`: runs every 15 minutes during weekday market hours. The backend rechecks the America/New_York market window before doing work.
- `newleaf-scanner-daily-catchup`: runs on the same cadence and uses Firestore markers so OI enrichment, watchlist generation, and Firestore sync run once per trading day.

Before each run, `scanner/run-scheduler-job.js` loads `marketWatchlists/default` from Firestore. It writes the active scan set to the ignored `scanner/watchlist.runtime.json`, sets `WATCHLIST_FILE` for child scripts, and applies watchlist rate-limit settings. If the managed config is unavailable, the worker falls back to the local `scanner/watchlist.json`.

Seed the managed config from the current local watchlist:

```bash
node scanner/seed-managed-watchlist.js
```

## Required Config

- `SCHEDULER_API_BASE_URL=https://api.newleafsystem.com`
- `SCHEDULER_SHARED_SECRET`
- `GCP_PROJECT_ID` or `FIREBASE_PROJECT_ID`
- `GCP_SCHEDULER_REGION`
- `GCP_SCHEDULER_SERVICE_ACCOUNT` when using OIDC
- Alpaca, R2, Firebase Admin, pipeline, and watchlist variables from `.env.example`

## Setup

Preview the Google Cloud Scheduler changes:

```bash
bash scripts/setup-google-cloud-scheduler.sh --dry-run
```

Create or update jobs:

```bash
bash scripts/setup-google-cloud-scheduler.sh
```

The setup script redacts `SCHEDULER_SHARED_SECRET` in dry-run output and does not print secret values.
