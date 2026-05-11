# NewLeaf System

AI-Powered Options Intelligence Platform — [newleafsystem.com](https://newleafsystem.com)

## Quick Start

```bash
cd client-web
npm install
```

## Weekly Workflow

### Monday AM — Publish Picks

```bash
# Step 1: Analyze stocks in the strategy builder
open http://localhost:3000/strategy-builder.html

# Step 2: For each stock you like → click "Publish to Firebase"
# (sign in with Google first)

# Step 3: Generate weekly picks page + analysis pages
node pipeline/create-weekly-picks.js --theme "Your market commentary here"

# Step 4: Deploy to newleafsystem.com
npm run deploy
```

### Wednesday — Mid-Week Check

```bash
# Check positions — no scripts needed
# Close tiles manually from Firebase Console or admin page if targets hit
```

### Friday PM — Close Week

```bash
# Step 1: Close the week (deactivates tiles, calculates P&L)
npm run picks:close

# Step 2: Deploy updated review page
npm run deploy
```

---

## All Commands

| Command | What it does |
|---------|-------------|
| `npm run picks:preview` | Dry run — shows what would be created |
| `npm run picks:close` | Close current week + generate review page |
| `npm run email:preview` | Generate the weekly email preview |
| `npm run email:send` | Send the weekly email |
| `npm run outputs` | Generate pipeline outputs |
| `npm run deploy` | Deploy everything to newleafsystem.com |

## Pipeline Scripts (detailed)

### `pipeline/create-weekly-picks.js`

Bundles published tiles into a Firestore `weeklyPicks` document and generates HTML pages.

```bash
# Basic (current week, auto-detects tiles)
node pipeline/create-weekly-picks.js

# With market theme
node pipeline/create-weekly-picks.js --theme "IV elevated — premium selling favoured"

# Specific week
node pipeline/create-weekly-picks.js --week 2026-W16

# Preview without writing to Firestore
node pipeline/create-weekly-picks.js --dry-run
```

**Reads:** Active tiles from Firestore where `source = 'strategy-builder'`
**Writes:** `weeklyPicks/{weekId}` doc in Firestore
**Generates:**
- `dist/picks/index.html` — current week's picks page
- `dist/picks/{weekId}/index.html` — permalink for the week

### `pipeline/generate-analysis-pages.js`

Creates rich HTML analysis pages for each pick with full trade detail.

```bash
# All picks from strategy-builder tiles
node pipeline/generate-analysis-pages.js

# Single symbol
node pipeline/generate-analysis-pages.js --symbol NVDA

# Also generate PDFs + upload to R2
node pipeline/generate-analysis-pages.js --pdf
```

**Reads:** Tiles from Firestore + R2 reports (gamma, technicals)
**Generates:** `dist/picks/analysis/{symbol}/index.html` per pick

### `pipeline/close-week.js`

Friday routine — closes tiles, calculates P&L, generates review page.

```bash
# Current week
node pipeline/close-week.js

# Specific week
node pipeline/close-week.js --week 2026-W16

# Preview
node pipeline/close-week.js --dry-run
```

**Updates:** Deactivates tiles in Firestore, adds `review` to weeklyPicks doc
**Generates:** `dist/picks/review/index.html`

### PDF + Video Scripts (from newleafreport)

```bash
# Generate PDF report for a symbol (requires weasyprint)
cd pipeline
python3 newleaf-report.py NVDA

# Generate video script only
python3 generate-script.py NVDA

# Batch generate for multiple symbols
python3 batch-generate.py SPY QQQ AAPL NVDA

# Upload PDFs to R2
python3 upload-to-r2.py NVDA --pdf-only
```

**Dependencies:** `pip install weasyprint yfinance boto3`

---

## Stock Data Pipeline

The scanner and report pipeline live in this repository. Runtime configuration is read from `.env`.

```bash
# Scan specific symbols
node scanner/newleaf-pipeline.js NVDA AAPL TSLA

# Scan full watchlist (111 stocks)
node scanner/newleaf-pipeline.js --watchlist

# Data sources: Alpaca market data + yahoo-finance2 option expiry/OI enrichment
# Output: R2 → reports/{SYMBOL}/latest.json + contracts/atm-latest.json
```

Production scanner scheduling is handled by Google Cloud Scheduler calling
`https://api.newleafsystem.com/api/internal/scheduler/*`. The scheduler entrypoint
is `node scanner/run-scheduler-job.js`; local cron wrappers delegate to that Node
runner.

---

## Live URLs

| URL | What |
|-----|------|
| [newleafsystem.com](https://newleafsystem.com) | Landing page |
| [newleafsystem.com/picks](https://newleafsystem.com/picks) | Weekly picks |
| [newleafsystem.com/picks/analysis/spy](https://newleafsystem.com/picks/analysis/spy/) | Analysis page (example) |
| [newleafsystem.com/sitemap.xml](https://newleafsystem.com/sitemap.xml) | Sitemap |
| [newleafsystem.com/workbench](https://newleafsystem.com/workbench) | Workbench (strategy builder) |
| [newleafsystem.com/invest](https://newleafsystem.com/invest) | Trading app (investor) |

## Project Structure

```
newleafsystem/
├── dist/                          ← Firebase Hosting (deployed)
│   ├── index.html                 ← Landing page
│   ├── robots.txt                 ← SEO
│   ├── sitemap.xml                ← SEO
│   └── picks/
│       ├── index.html             ← Current week picks
│       ├── review/index.html      ← Weekly review (after Friday close)
│       ├── 2026-W16/index.html    ← Week permalink
│       └── analysis/
│           ├── spy/index.html     ← Full analysis per symbol
│           ├── qqq/index.html
│           └── .../
│
├── pipeline/                      ← Report generation + data scripts
│   ├── create-weekly-picks.js     ← Monday: bundle tiles → picks page
│   ├── generate-analysis-pages.js ← Monday: tiles → analysis HTML
│   ├── close-week.js              ← Friday: close tiles, P&L review
│   ├── newleaf-report.py          ← PDF generation (WeasyPrint)
│   ├── generate-script.py         ← Video narration scripts
│   ├── generate-report.py         ← JSON → PDF renderer
│   ├── batch-generate.py          ← Multi-symbol batch
│   ├── build-report-data.py       ← Build JSON data from Alpaca/Yahoo
│   ├── upload-to-r2.py            ← Upload PDFs/scripts to R2
│   ├── alert.py                   ← Position alerts
│   ├── templates/                 ← PDF HTML templates
│   ├── assets/                    ← Logos, images
│   ├── data/                      ← Trade data JSONs
│   └── positions/                 ← Active position tracking
│
├── docs/                          ← Architecture, planning, and design docs
├── scripts/                       ← Local and GitHub Actions helper scripts
├── firebase.json                  ← Firebase Hosting config
├── .firebaserc                    ← Firebase project binding
└── package.json                   ← npm scripts
```

## Firebase

- **Project:** `newleaf-trading`
- **Database:** `newleafdb` (Firestore)
- **Test Hosting site:** `newleaf-preview` -> preview.newleafsystem.com
- **Production Hosting site:** `newleafsystem` -> newleafsystem.com and www.newleafsystem.com
- **Auth:** Google + email/password
- **Service account:** use `FIREBASE_CREDENTIALS_BASE64` locally and in GitHub Actions secrets. Do not keep service account JSON files in the repo.

## GitHub Actions

- `CI` validates shell, JS, Python syntax, sensitive candidate scans, and the Vite build.
- `Deploy Web` builds once, then deploys Firebase test by default.
- Pushes to `main` deploy to `FIREBASE_TEST_HOSTING_TARGET`, defaulting to `newleaf-preview`.
- Production Firebase deploys require manual dispatch with `deploy_environment=production`.
- Google Cloud Run deploys are manual and use the selected `test` or `production` GitHub environment.
- Google Cloud Scheduler is configured with `scripts/setup-google-cloud-scheduler.sh`; Cloudflare is not used for scheduling.

Useful deploy variables:

| Key | Default | Purpose |
|-----|---------|---------|
| `FIREBASE_PROJECT_ID` | `newleaf-trading` | Firebase/GCP project |
| `FIREBASE_TEST_HOSTING_TARGET` | `newleaf-preview` | Test Hosting target |
| `FIREBASE_HOSTING_TARGET` | `newleafsystem` | Production Hosting target |
| `VITE_FIREBASE_AUTH_DOMAIN` | `api.newleafsystem.com` | Shared Firebase Auth popup/redirect handler domain |
| `AUTH_SESSION_MAX_AGE_HOURS` | `24` | HTTP-only auth session cookie lifetime |
| `AUTH_SESSION_SECURE` | `true` | Adds Secure to the auth session cookie |
| `AUTH_SESSION_SAME_SITE` | `Lax` | SameSite mode for the auth session cookie |
| `AUTH_SESSION_ALLOWED_ORIGINS` | empty | Optional comma-separated CORS allowlist when the auth API is on a separate origin |
| `VITE_AUTH_STATE_CACHE_TTL_HOURS` | `24` | Sanitized UI auth-cache cookie lifetime |
| `VITE_AUTH_SESSION_VALIDATE_INTERVAL_MINUTES` | `15` | Minimum age before the UI cache revalidates the HTTP-only auth session on page load |
| `VITE_AUTH_SESSION_API_BASE_URL` | `https://api.newleafsystem.com` | Shared NewLeaf API origin for `/api/auth/*` session endpoints |
| `GCP_TEST_CLOUD_RUN_SERVICE` | empty | Optional test Cloud Run service |
| `GCP_CLOUD_RUN_SERVICE` | empty | Optional production Cloud Run service |
| `SCHEDULER_API_BASE_URL` | `https://api.newleafsystem.com` | Backend origin called by Google Cloud Scheduler |
| `SCHEDULER_SHARED_SECRET` | empty | Secret header value for scheduler trigger endpoints |
| `GCP_SCHEDULER_REGION` | `us-central1` | Google Cloud Scheduler region |
| `GCP_SCHEDULER_SERVICE_ACCOUNT` | empty | Optional service account used for Scheduler OIDC token |

Public market/report JSON, PDFs, thumbnails, and Workbench guide media must load through `https://api.newleafsystem.com/api/v1/public/data/*` or `/api/v1/public/media/*`. Do not add browser calls to object-storage provider hosts directly; the shared API owns those origins.

Live market-data tools must call `https://api.newleafsystem.com/api/v1/market/*` with the shared auth session. Do not store provider credentials in browser storage.

Auth session notes:

- The secure Firebase Admin session cookie is set by the Node service at `/api/auth/session`.
- Google sign-in uses the Firebase Web SDK `authDomain`. For client-web preview and production, set `VITE_FIREBASE_AUTH_DOMAIN=api.newleafsystem.com`. The client Hosting site changes between preview and production, but the auth handler stays on the shared API facade.
- Firebase Authentication authorized domains should include only the NewLeaf browser origins and auth-handler domains you actually use: `api.newleafsystem.com`, `newleafsystem.com`, `www.newleafsystem.com`, `preview.newleafsystem.com`, `admin.newleafsystem.com`, and `localhost` for local development.
- The browser-readable auth cache stores only sanitized identity/profile fields for faster first paint. It does not store Firebase ID tokens, refresh tokens, or secrets.
- `VITE_AUTH_SESSION_VALIDATE_INTERVAL_MINUTES` throttles startup validation so each page does not block on `/api/auth/session`; set it lower if entitlement revocation must be reflected faster.
- For Firebase Hosting, client-web should set `VITE_AUTH_SESSION_API_BASE_URL=https://api.newleafsystem.com`. The shared API sets the HTTP-only session cookie with `AUTH_SESSION_COOKIE_DOMAIN=.newleafsystem.com` and `AUTH_SESSION_COOKIE_PATH=/`, so both client-web and admin-web use the same auth channel.
- For plain `http://localhost` testing, use a non-prefixed cookie name and `AUTH_SESSION_SECURE=false`; production should keep `AUTH_SESSION_SECURE=true`.

Sync repo variables/secrets from local `.env` without printing values:

```bash
bash scripts/setup-github-actions-config.sh --dry-run --repo OWNER/REPO
bash scripts/setup-github-actions-config.sh --repo OWNER/REPO
```

## DNS (names.co.uk)

| Type | Host | Value |
|------|------|-------|
| A | @ | 199.36.158.100 |
| CNAME | www | Firebase Hosting-provided target for `www.newleafsystem.com` |
| TXT | @ | hosting-site=newleafsystem |
| TXT | @ | Search Console verification TXT from Google (set only in DNS, not repo) |

## Google Analytics

- **Property:** G-06YFVHFNYT (shared with newleaf-trading)
- **Search Console:** Verified via DNS TXT record
- **Sitemap:** Submitted at newleafsystem.com/sitemap.xml
