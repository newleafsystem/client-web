# Implementation Patterns

This document is the implementation source of truth for agents and maintainers working in `client-web`. When logic, routing, build, deployment, runtime config, security posture, or architecture changes, update this file in the same change set.

The prior baseline is kept in [implementation-patterns-prior.md](implementation-patterns-prior.md). Before replacing a major pattern, preserve the previous guidance there or in a dated follow-up section so agents can see what changed.

## Architecture

`client-web` combines:

- A React/Vite public website and investor frontend.
- Legacy HTML workbench tools embedded inside React-owned Workbench routes.
- Firestore-backed picks and publishing workflows.
- Scanner/report scripts that publish JSON, PDF, email, and status data to Cloudflare R2 and Firestore.
- Firebase Hosting targets for preview and production.
- Manual optional deployment hooks for Cloudflare Pages and Google Cloud Run.

Top-level composition:

- `src/App.jsx` owns route composition.
- Eager app shells keep global navigation visible while route content lazy-loads.
- `BrandBar` and `Footer` are shared shell primitives, not per-page afterthoughts.
- `PublicLayout`, `TradingLayout`, `WorkbenchLayout`, and `PicksLayout` own their respective route surfaces.
- `/trading/*` is legacy and redirects to `/invest/*`.

## Pattern Maintenance

- Update this file whenever a logic or architectural change lands.
- Keep changes concrete: name the files, loaders, workflows, and commands that define the pattern.
- Do not document secrets or local values. Document key names and required variables only.
- Preserve the previous implementation guidance in `docs/implementation-patterns-prior.md` before replacing a substantial pattern.
- Keep historical planning docs under `docs/`; production code and hosted static files should use current canonical names.

## Frontend

Route ownership:

- `src/App.jsx`: public routes, product routes, strategy skill pages, picks, workbench analysis, blog, and legacy redirects.
- `src/trading`: investor app, product pages, strategy education pages, hooks, calculations, and shared trading UI.
- `src/marketing`: public explanation and trust pages.
- `src/picks`: weekly picks, recaps, monthly views, and symbol analysis.
- `src/blog`: blog layouts, posts, and post routing.
- `src/shared`: navigation, SEO, auth hooks, shared layouts, and cross-surface shell components.
- `workbench`: raw legacy HTML workbench tools copied to `dist/workbench-static` and embedded by React routes.

Naming and production hygiene:

- Active production page files use canonical names such as `LandingPage.jsx`, `DiscoverPage.jsx`, and `PerformancePage.jsx`.
- Do not put versioned, backup, old, refactored, mockup, temp, or browser-test artifacts in `src/`, `public/`, `workbench/`, or `pipeline/templates/`.
- Run `npm run audit:hygiene` before claiming a production-facing cleanup is complete.
- See [repo-hygiene-audit.md](repo-hygiene-audit.md) for enforced naming rules.

UI patterns:

- Preserve lazy route imports in `src/App.jsx`.
- Keep layout shells eager when they affect navigation/header/footer timing.
- Reuse existing layouts before adding new shells.
- Use `BrandBar` plus `src/shared/components/navConfig.js` as the central navigation model.
- `BrandBar` renders one stable main header across public, picks, workbench, invest, quant, desk, blog, and how-it-works routes. The main header order is Picks, Workbench, Invest, Quant, Desk, Blog, and How it works.
- Product-specific navigation belongs inside `BrandBar` flyouts. Do not add page-local product nav bars under the NewLeaf logo or create secondary headers inside product pages.
- Top-level product labels such as Picks, Workbench, Invest, Quant, and Desk must be real links to the product landing page. Do not duplicate that same landing page as an `Overview`, `Hub`, or `Home` item inside the flyout.
- Use `Footer` in every route surface. Layout shells should own footer placement when the page belongs to a route family.
- Use `src/shared/components/LeafLoader.jsx` for route, auth, and API loading states. Do not add one-off loading text, emoji spinners, or blank suspense fallbacks.
- Home hero background video uses `src/trading/components/HeroBackgroundVideo.jsx`. It must use a native `<video>` element without a `controls` attribute; do not use YouTube/Vimeo/third-party iframes for hero background video because their player overlays can reappear after tab visibility changes. Serve hero media through `https://api.newleafsystem.com/api/v1/public/media/home/` as optimized MP4 assets under the Firebase Hosting rewrite size limit; add HLS only after versioned playlists and segments are uploaded and verified through the same API facade.
- Use `src/trading/styles/brand.css` for canonical brand tokens. The official large-surface gradient is `--brand-gradient`; shared primary and secondary buttons use `--brand-button-*` variables or the `.nl-btn-primary` and `.nl-btn-secondary` helpers.
- Do not introduce one-off dark green gradients for large branded areas. Reuse `--brand-gradient` for header/footer-adjacent surfaces, hero bands, compact CTA bands, and focused product story moments.
- Do not stack repeated full-width dark green surfaces, and do not stretch one large brand gradient across long content runs. Use one intentional brand-gradient moment, then alternate adjacent content onto warm ivory, white, or very soft green surfaces with restrained gold accents.
- Keep `Banner` surfaces compact and accent-led. If a banner grows into a page section, redesign it as a full section with its own visual hierarchy instead of reusing the compact dark banner treatment.
- Do not use green or gradient-filled primary buttons. Primary actions use the solid muted-gold brand button token; secondary actions use the warm-ivory token with a muted-gold border.
- Use `src/shared/auth/accessControl.js` for product app ids, role ids, app-access normalization, and navigation filtering.
- Do not hand-maintain duplicate product navs inside page bodies.
- Do not use browser-native `alert`, `confirm`, or `prompt`. React pages must use `src/shared/components/NotificationProvider.jsx`; static Workbench pages must use `window.NewLeafModal` from `scripts/workbench-modal-runtime.js`.
- Keep public pages educational and risk-aware. Do not imply guaranteed profit, risk-free trades, or certainty.
- Firebase web config must come from `import.meta.env.VITE_FIREBASE_*`; do not hardcode Firebase API keys.
- Marketing/product pages should be composed from reusable components under a local `components/` folder when a section has repeated cards, labels, or interaction patterns. Avoid adding new page-scale JSX blocks that cannot be reused elsewhere.

## Auth, Roles, And Product Access

User management is owned by `admin-web`. `client-web` consumes the shared Firebase Auth user and Firestore profile only.

Shared profile contract:

- Collection: `users/{uid}`.
- Database: Firebase project `newleaf-trading`, Firestore database `newleafdb`.
- Entitlement fields: `status`, `roles`, and `appAccess`.
- Canonical app ids: `invest`, `picks`, `workbench`, `admin`, `quant`, `desk`.

Patterns:

- `src/shared/hooks/useAuth.js` is a shared singleton auth store. Do not create independent Firebase Auth or user-profile listeners in route components.
- Auth starts from a sanitized UI cache cookie when present, so header/nav state can render before a server round trip. The readable UI cache must never contain ID tokens, refresh tokens, service credentials, private profile data, or bearer JWTs.
- Role-filtered header and footer visibility is cached in browser `localStorage` under `newleaf_navigation_state` after sign-in. This cache stores only derived UI navigation JSON keyed to the signed-in user id and expiry; it is not an auth source and must be cleared on logout with the auth UI cache.
- The authoritative browser session cookie is set by `server.cjs` through `/api/auth/session` using Firebase Admin session cookies. It is HTTP-only, SameSite-controlled, secure by default, and expires after `AUTH_SESSION_MAX_AGE_HOURS` which defaults to `24`.
- `VITE_AUTH_STATE_CACHE_TTL_HOURS` controls only the sanitized first-paint UI cache. It should match `AUTH_SESSION_MAX_AGE_HOURS` unless there is a deliberate reason to make the visible UI cache shorter.
- `VITE_AUTH_SESSION_VALIDATE_INTERVAL_MINUTES` controls how often the UI cache revalidates with `/api/auth/session` on startup. The default is `15`, which avoids a blocking auth API call on every page while keeping role/access changes bounded by a short refresh window.
- Protected backend actions must still trust only Firebase Auth, the HTTP-only session cookie, Firestore rules, or server-side access checks. The browser-readable UI cache is for display and navigation responsiveness only.
- Firebase Google sign-in popup and redirect flows use `VITE_FIREBASE_AUTH_DOMAIN` as the `/__/auth/handler` host. Client-web preview and production builds should both use `api.newleafsystem.com`; only the static Firebase Hosting target differs between preview and production. Do not use default Firebase platform auth origins for NewLeaf preview or production builds.
- Firebase Authentication authorized domains must include every app origin and handler domain used by client-web: `api.newleafsystem.com`, `preview.newleafsystem.com`, `newleafsystem.com`, `www.newleafsystem.com`, `admin.newleafsystem.com`, and localhost for development.
- `VITE_AUTH_SESSION_API_BASE_URL` should point to `https://api.newleafsystem.com` in preview and production. The shared admin-web API owns `/api/auth/*`, sets the HTTP-only Firebase session cookie for `.newleafsystem.com`, and returns the same `appAccess` user record consumed by admin-web.
- `VITE_API_BASE_URL` should point to `https://api.newleafsystem.com/api/v1` for any client-web API calls. Do not point preview builds at preview-specific backends.
- If Firebase Hosting serves the static app without an auth API rewrite and `VITE_AUTH_SESSION_API_BASE_URL` is empty, the React auth store falls back to Firebase client persistence and the session-cookie calls become no-ops. Production builds should avoid that fallback.
- Local HTTP testing of server-set cookies needs `AUTH_SESSION_SECURE=false` and a non-prefixed cookie name. Production should keep secure cookies enabled.
- `client-web` may create a missing user profile on first sign-in, but it must not overwrite existing `roles` or `appAccess`.
- `/register` and `/signin` are the canonical email/password and Google account entry points. Public CTAs should link to these routes instead of launching a Google-only popup.
- Firebase Auth must have Email/Password and Google enabled with one account per email address so a same-email Google attempt can be linked into the existing password account.
- Auth errors must be shown through `NotificationProvider` or inline form state with sanitized text. Do not rely on raw Firebase messages or console logging for user-visible auth failures.
- Email/password registration writes `communicationEmail`, `emailVerified`, `identityProviderIds`, and `authProviders` alongside the conservative default entitlements.
- Google sign-in for an email that already has a password account must use Firebase provider linking, not a second Firestore profile. `src/shared/hooks/useAuth.js` throws `auth/google-link-password-required`; `LoginPage` asks for the existing password and then calls `linkGoogleWithPassword`.
- New non-admin users default to `roles: ['investor']` and only `appAccess.invest: true`.
- `sd.nirsha@gmail.com` and `manish28june@gmail.com` are immutable admins. They always receive admin role and all app access in client-web and admin-web.
- `VITE_ADMIN_EMAILS` is bootstrap fallback only. Once `admin-web` writes explicit `appAccess`, Firestore wins for env-only bootstrap admins.
- Disabled, inactive, revoked, or suspended profiles must not receive app access.
- `BrandBar` filters product navigation with `requiredApp` and `requiredRole` metadata from `src/shared/components/navConfig.js`; it should read the shared cached navigation state from `src/shared/components/navigationState.js` when available.
- `Footer` uses the same cached navigation state as `BrandBar` so the Platform links reflect the same role-aware product model.
- `AppAccessGate` blocks React route surfaces such as Picks, Workbench analysis, Invest, and the legacy client admin page.
- Standalone React child pages must pass the real `useAuth()` loading/user state into `BrandBar`; never hardcode `authState="in"`.
- Workbench child pages are React-owned routes. `WorkbenchLayout` applies `AppAccessGate`, and the shared `BrandBar`/`Footer` read the cached role-aware navigation state.

See [access-control.md](access-control.md) for the shared admin-web/client-web schema and ownership rules.

## Navigation And Workbench

`BrandBar` is the canonical React navigation component for root, picks, workbench, and invest surfaces.

- Product/surface links live in `src/shared/components/navConfig.js`.
- `MAIN_NAV_SECTIONS` is the canonical main header model. Keep top-level products visible, then gate internal flyout links with `requiredApp` or `requiredRole`.
- Dropdown entries are for child/internal destinations only. Product landing routes belong on the clickable top-level dropdown trigger.
- Product links must carry `requiredApp` or `public` metadata; do not add product links that bypass `accessControl.js`.
- Auth loading should render a stable header skeleton instead of signed-out buttons, so the header does not flicker between auth states.
- `src/shared/components/navigationState.js` is the shared derived navigation cache. Do not create page-local localStorage keys for product navigation or duplicate role filtering in page components.
- Every user-facing `/workbench/*` route uses `WorkbenchLayout`, including legacy tool pages such as `/workbench/watchlist`, `/workbench/all-stocks`, and `/workbench/strategy-builder`.
- `src/shared/components/WorkbenchStaticPage.jsx` embeds raw Workbench HTML from `/workbench-static/{page}.html` inside the React shell. Do not link users directly to `/workbench-static/*`.
- `workbench/load-nav.js` is an embedded content runtime only. It may install the Workbench data loader, modal helper, iframe height relay, and link bridge back to extensionless `/workbench/*` routes. It must not render header, footer, auth controls, or role checks.
- Static Workbench notification UI is provided by `window.NewLeafModal` from `workbench/load-nav.js`.
- Static Workbench market-data fetches should use the shared loader installed by `workbench/load-nav.js`; do not add page-local spinner fragments for API/data calls.
- Browser code must not call storage provider hosts directly. Market JSON, PDFs, thumbnails, and static video assets should resolve through `https://api.newleafsystem.com/api/v1/public/data/*` or `https://api.newleafsystem.com/api/v1/public/media/*`. React code should use `src/shared/api/publicAssets.js`; static Workbench HTML may use the absolute API facade URL.
- Static Workbench scanner pages should use the batched latest-report endpoint `GET /api/v1/public/data/reports/latest?symbols=A,B,C` when enriching multiple symbols. Do not add browser loops that fetch one `reports/{SYMBOL}/latest.json` asset per visible stock unless the batch endpoint fails in a local preview.
- Browser code must not store provider API keys or call provider market-data APIs directly. Live quote features should call `https://api.newleafsystem.com/api/v1/market/*` with `credentials: "include"` so provider credentials remain on the backend.
- Do not read `import.meta.env` dynamically in browser code. Reference only the exact `VITE_*` keys required by the feature so Vite does not serialize unrelated environment values into the production bundle.
- Static Workbench pages must not include their own visible product header/footer when embedded. `workbench/load-nav.js` hides direct `body > nav` and `body > footer` elements inside the iframe.
- User-facing Workbench links must be extensionless, for example `/workbench/stock?symbol=SPY` instead of `/workbench/stock.html?symbol=SPY`.
- Raw Workbench links inside embedded pages should be bridged by `workbench/load-nav.js` to extensionless React routes.

The build must not retain deleted static pages:

- `scripts/clean-spa.js` removes stale `dist/workbench/` and `dist/workbench-static/` before build.
- `vite.config.js` copies `workbench/` into `dist/workbench-static/` after Vite builds the React shell.
- Browser credential/API test pages do not belong in hosted `workbench/`.

## Runtime Config

Runtime config is environment-driven.

- Browser config: `VITE_*` values from Vite env.
- Node config: `lib/env.cjs` and `lib/runtime-config.cjs`.
- Firebase Admin: `lib/firebase-admin.cjs`.
- Auth session cookies and UI cache: `AUTH_SESSION_COOKIE_NAME`, `AUTH_SESSION_MAX_AGE_HOURS`, `AUTH_SESSION_SECURE`, `AUTH_SESSION_SAME_SITE`, `AUTH_SESSION_ALLOWED_ORIGINS`, `VITE_AUTH_STATE_CACHE_TTL_HOURS`, and `VITE_AUTH_SESSION_VALIDATE_INTERVAL_MINUTES`.
- Scanner config: `scanner/lib/config.js`.
- Scheduler config: `SCHEDULER_API_BASE_URL`, `SCHEDULER_SHARED_SECRET`, `SCHEDULER_ALLOW_UNAUTHENTICATED`, `SCHEDULER_LOCK_TTL_MINUTES`, `GCP_SCHEDULER_REGION`, and `GCP_SCHEDULER_SERVICE_ACCOUNT`.
- Python pipeline config: `pipeline/config_loader.py`.
- GitHub repo configuration loader: `scripts/setup-github-actions-config.sh`.

Do not read legacy JSON credentials or config:

- `scanner/config.json`
- the old Alpaca JSON config file under `pipeline/`
- Firebase service account JSON files

Add new config keys to `.env.example`, runtime loaders, GitHub Actions config helper, workflows if needed, and docs together. Preserve existing `.env` values and never print them.

## Firebase

- Firebase project id: `newleaf-trading`.
- Firestore database id: `newleafdb`.
- Preview Hosting target/site: `newleaf-preview`.
- Production Hosting target/site: `newleafsystem`.
- Production custom domains: `newleafsystem.com` and `www.newleafsystem.com`.
- Preview custom domain: `preview.newleafsystem.com`.

Firebase Admin credentials should use one of:

- `FIREBASE_CREDENTIALS_BASE64`
- `FIREBASE_CREDENTIALS_JSON`
- `FIREBASE_CREDENTIALS_FILE` or `GOOGLE_APPLICATION_CREDENTIALS` for local-only file paths
- Application Default Credentials when explicitly enabled

Do not commit local Firebase service account JSON. GitHub Actions writes service-account JSON only into `$RUNNER_TEMP`.

## Build And Static Output

The web build order is:

```bash
node scripts/clean-spa.js
vite build
node scripts/prerender.js
```

`npm run build` runs the full sequence.

Patterns:

- Vite builds the React SPA into `dist/`.
- Raw Workbench HTML is copied into `dist/workbench-static/`.
- Extensionless `/workbench/*` URLs are served by the React SPA and embedded raw Workbench content through `WorkbenchStaticPage`.
- `scripts/prerender.js` prerenders the configured public routes for crawler-friendly HTML.
- `dist/` is generated output and must not be committed.
- Keep runtime HTML in `index.html`, `workbench/`, `public/`, and `pipeline/templates/`.

## Pipeline And Scanner

Scanner scripts under `scanner/` should:

- Use `scanner/lib/config.js`.
- Validate required config by key name only.
- Keep reports, logs, and generated output under ignored directories.
- Avoid absolute machine paths.
- Keep scheduler shell wrappers under `scripts/scanner/`.
- Use Node.js for scanner runtime services. The former Python Yahoo sidecar is replaced by `scanner/lib/yahooFinance.js`, backed by `yahoo-finance2`.
- Keep Alpaca as the primary Node market-data source for stock snapshots, bars, option quotes, IV, and Greeks.
- Use Yahoo Finance through the Node adapter for option expiration calendars and open interest enrichment.
- Run production schedules through Google Cloud Scheduler calling `https://api.newleafsystem.com/api/internal/scheduler/*`. Do not use Cloudflare for scheduling.
- `scanner/run-scheduler-job.js` is the canonical scheduler entrypoint. It supports `market-universe-sync`, `scanner-fast`, `scanner-daily-catchup`, `scanner-oi`, `scanner-watchlist`, and `scanner-sync-firestore`.
- Scheduler overlap protection and daily catch-up markers live in Firestore through `scanner/lib/scheduler-state.cjs`; do not use `/tmp` marker files for production scheduling.
- Managed scanner watchlist config lives in Firestore at `marketWatchlists/default` and is edited by admin-web. Scheduler runs call `scanner/lib/watchlist-config.cjs` first, write an ignored `scanner/watchlist.runtime.json`, and then child pipeline scripts read that runtime file through `WATCHLIST_FILE`.
- Full listing universes live in top-level `marketUniverseSymbols` documents keyed by `MARKET:SYMBOL`. `scanner/sync-market-universe.js` refreshes those listings daily from free trusted market-specific sources such as Nasdaq Trader files for US and NSE's equity CSV for India. China uses a configured CSV URL until a stable free official source is selected.
- Only enabled symbols in enabled scan markets are processed. Non-US markets can be stored for planning, but keep them `scanEnabled=false` until the scanner has compatible provider support.
- Rate-limit settings live with the managed watchlist and runtime environment. Respect `maxSymbolsPerRun`, `maxSymbolsPerMarket`, `intradayConcurrency`, `dailyConcurrency`, `yahooRequestDelayMs`, `yahooBatchSize`, `yahooBatchDelayMs`, and `yahooMaxOiExpiries`; daily Yahoo OI processing stays sequential.
- Yahoo Finance has a tight daily-call budget. `scanner/lib/yahooFinance.js` must use the provider cache before live calls, reserve live calls against `YAHOO_DAILY_CALL_LIMIT`, and fall back to stale cache when live calls are blocked but cached data exists.
- `server.cjs` exposes scheduler trigger endpoints under `/api/internal/scheduler/{job}`. Requests must include `X-NewLeaf-Scheduler-Secret` when `SCHEDULER_SHARED_SECRET` is configured.
- `scripts/setup-google-cloud-scheduler.sh` creates or updates the Google Cloud Scheduler HTTP jobs. It must never print `SCHEDULER_SHARED_SECRET`.
- See [google-cloud-scheduler.md](google-cloud-scheduler.md) for setup flow and required variables.

Pipeline scripts under `pipeline/` should:

- Use `lib/runtime-config.cjs` for Node or `pipeline/config_loader.py` for Python.
- Prefer dry-run or preview modes for publishing changes.
- Write generated reports to ignored output directories or external stores.
- Avoid logging full URLs if they include tokens or signed credentials.
- Use `pipeline/templates/report.html` as the default report template.
- Use `pipeline/templates/report-portrait.html` for portrait report generation.
- Keep email HTML in `pipeline/templates/weekly-email-template.html`.
- Resolve email recipients from `users/{uid}.notificationPreferences.email`. The weekly picks sender should only include users whose email delivery is enabled and whose `weeklyPicks` topic is not disabled; do not email every user solely because an email field exists.
- Managed scanner watchlists come from `marketWatchlists/default` and may contain more active symbols than a provider's preferred batch size. The scanner should process every active symbol in consecutive batches using `YAHOO_BATCH_SIZE` and `YAHOO_BATCH_DELAY_MS`; do not silently truncate the runtime watchlist at 150 symbols.
- Intraday runs should reuse the cached Yahoo expiration calendar. Daily OI runs should cap Yahoo chain calls with `YAHOO_MAX_OI_EXPIRIES=1` by default so a 111-symbol US watchlist stays under the 250-call daily Yahoo budget when the cache is warm for expiration lookups.

## Deployment

GitHub Actions are staged:

- `CI`: validation only.
- `Deploy Web`: builds once, deploys Firebase preview on push to `main`, and deploys production only by manual dispatch.
- `Ops Pipeline`: manual operational entry points for picks, email, scanner, and upload jobs.

Default Firebase targets:

- `FIREBASE_TEST_HOSTING_TARGET=newleaf-preview`
- `FIREBASE_HOSTING_TARGET=newleafsystem`

Deployment rules:

- Firebase Hosting uses `cleanUrls: true`; do not add new user-facing `.html` links.
- Test on `newleaf-preview` before production.
- Production `newleafsystem` deploys are manual and explicit.
- Cloud Run backend deploys are manual and require repo variables/secrets before use.
- Google Cloud Scheduler is the production scheduler for scanner jobs. Use `scripts/setup-google-cloud-scheduler.sh` after the backend is deployed and TLS is healthy.
- Cloudflare is not a scheduler for this repo.
- GitHub variables/secrets should be loaded with `scripts/setup-github-actions-config.sh`; never print values.

## Security

Never commit or print:

- Firebase private keys or service account JSON.
- Alpaca, R2, SMTP, XAI, Gemini, Cloudflare, Google Cloud, or other API keys.
- OAuth tokens or refresh tokens.
- `.env` values.
- Local absolute paths or machine-specific settings.

Use the sensitive scanner in the right mode:

```bash
node scripts/scan-sensitive-candidates.cjs --staged
node scripts/scan-sensitive-candidates.cjs --all
```

`--staged` checks the actual staged commit candidates. `--all` checks tracked files broadly.

## Commands

Install:

```bash
npm install
npm install --prefix scanner
```

Development and build:

```bash
npm run dev
npm run build
npm run preview
```

Pipeline examples:

```bash
npm run picks:preview
npm run picks:close
npm run email:preview
node scanner/newleaf-pipeline.js --watchlist
```

Deployment/config helpers:

```bash
bash scripts/setup-github-actions-config.sh --dry-run --repo OWNER/REPO
npx -y firebase-tools@latest deploy --project newleaf-trading --only hosting:newleaf-preview --dry-run
```

## Verification Before Finishing

Run the strongest cheap checks available for the change:

- Shell changes: `bash -n scripts/*.sh scripts/scanner/*.sh`
- JS/CJS/MJS changes: `node --check <file>`
- Python changes: `python -m py_compile <file>`
- Frontend/config/build changes: `npm run build`
- Production naming hygiene: `npm run audit:hygiene`
- Staged commit safety: `node scripts/scan-sensitive-candidates.cjs --staged`
- Broad secret safety: `node scripts/scan-sensitive-candidates.cjs --all`
- GitHub workflow changes: parse YAML locally if PyYAML is available, then validate with a GitHub Actions run after commit.

Report what changed, what was verified, and any remaining manual steps. Do not expose secret values.
