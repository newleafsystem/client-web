# Prior Implementation Patterns

This is the baseline implementation-pattern snapshot preserved before the May 2026 repo-hygiene and architecture documentation refresh. Keep this file as the prior reference when `docs/implementation-patterns.md` changes for logic or architecture updates.

## 2026-05-09: Per-Hook Firebase Auth Listeners

Previous guidance allowed every component calling `useAuth()` to create its own Firebase Auth observer and Firestore profile read/listener. Returning users waited for those checks before the header could show a user identity.

That pattern is superseded by:

- One shared auth store in `src/shared/hooks/useAuth.js`.
- A server-set Firebase Admin session cookie for authoritative HTTP-only sessions.
- A sanitized UI cache cookie for first-paint identity only.
- Configurable 24-hour default session expiry through `AUTH_SESSION_MAX_AGE_HOURS` and `VITE_AUTH_STATE_CACHE_TTL_HOURS`.

## 2026-05-09: Surface-Specific Product Navigation

Previous guidance allowed `BrandBar` surface configs such as `root`, `picks`, `workbench`, and `invest` to define different top-level navigation links. Product pages could therefore feel like separate applications and static Workbench pages could keep their own generated header behavior.

That pattern is superseded by:

- One shared main header model in `src/shared/components/navConfig.js`.
- Top-level products shown consistently across the site.
- Product-specific links shown inside secondary flyouts.
- Internal product links gated by `requiredApp` and `requiredRole` metadata.
- Auth loading rendered as a stable header state instead of first showing signed-out controls.

## 2026-05-09: Native Dialogs And HTML Workbench URLs

Previous guidance allowed static Workbench pages to link directly to copied `.html` files and did not define a shared notification primitive for browser messages. Some React and static pages used browser-native `alert` and `confirm` calls for errors, validation, and destructive actions.

That pattern is superseded by:

- React notifications through `src/shared/components/NotificationProvider.jsx`.
- Static Workbench notifications through `window.NewLeafModal`.
- Extensionless Workbench links such as `/workbench/strategy-builder`.
- Firebase Hosting `cleanUrls: true` plus `scripts/build-extensionless-static.mjs` for non-Firebase/static-preview compatibility.

## 2026-05-13: Generated Static Workbench Shell

Previous guidance used static Workbench pages as user-facing pages under `dist/workbench/`. A build script generated `workbench/nav-component.html` from React navigation primitives, then injected `scripts/workbench-nav-auth.js`, `scripts/workbench-nav-runtime.js`, `scripts/workbench-footer-runtime.js`, and `scripts/workbench-url-runtime.js` into those static pages. `scripts/build-extensionless-static.mjs` created directory-index copies for routes such as `/workbench/watchlist`.

That pattern is superseded by:

- React-owned `/workbench/*` routes in `src/App.jsx`.
- `WorkbenchLayout` rendering the only `BrandBar`, auth gate, and `Footer` for Workbench.
- `WorkbenchStaticPage` embedding raw HTML from `/workbench-static/*.html`.
- `workbench/load-nav.js` acting only as an embedded content runtime for loaders, modals, link bridging, and iframe height.
- No generated `nav-component.html`, static Workbench auth overlay, static footer fallback, or extensionless static Workbench copies.

## 2026-05-13: Dual Eager Home Hero Iframes

Previous guidance allowed the home hero to embed separate desktop and mobile YouTube iframes directly in `LandingPage.jsx` and hide one with CSS. That loaded both players at first paint and exposed native player UI more easily.

That pattern is superseded by:

- `src/trading/components/HeroBackgroundVideo.jsx` selecting one viewport-specific native video source.
- Lazy mounting with an `IntersectionObserver`.
- Native `<video>` with no `controls` attribute, public-media HLS sources, and MP4 fallback. YouTube/Vimeo/third-party iframes are not allowed for the background hero because their overlays can reappear after tab changes.

## Architecture

`client-web` combines:

- A React/Vite public and investor frontend.
- Static HTML workbench pages copied into the built site.
- Firestore-backed picks and publishing workflows.
- Scanner and report scripts that publish JSON, PDF, and status data to Cloudflare R2 and Firestore.
- Firebase Hosting targets for test and production.
- Manual optional deployment hooks for Cloudflare Pages and Google Cloud Run.

## Frontend

- `src/App.jsx` owns top-level route composition.
- `src/trading` owns investor and product app screens.
- `src/marketing` owns public explanation pages.
- `src/picks` owns weekly picks, recaps, monthly views, and symbol analysis pages.
- `src/blog` owns blog layouts and posts.
- `src/shared` owns reusable shell, navigation, auth, SEO, and layout helpers.
- `workbench` is static HTML and should remain browser-runnable.

Patterns:

- Preserve lazy imports in `src/App.jsx`.
- Keep feature components near their feature folder.
- Reuse existing layouts before adding new shells.
- Do not hardcode Firebase web config. Use `import.meta.env.VITE_FIREBASE_*`.
- Keep public pages educational and risk-aware.

## Runtime Config

Runtime config is environment-driven.

- Browser config: `VITE_*` values from Vite env.
- Node config: `lib/env.cjs` and `lib/runtime-config.cjs`.
- Firebase Admin: `lib/firebase-admin.cjs`.
- Scanner config: `scanner/lib/config.js`.
- Python pipeline config: `pipeline/config_loader.py`.

Do not read legacy JSON credentials or config:

- `scanner/config.json`
- the old Alpaca JSON config file under `pipeline/`
- Firebase service account JSON files

Add new config keys to `.env.example`, runtime loaders, GitHub Actions config helper, and docs together.

## Firebase

- Firebase project: `newleaf-trading`.
- Firestore database: `newleafdb`.
- Test Hosting target/site: `newleaf-preview`.
- Production Hosting target/site: `newleafsystem`.

Firebase Admin credentials should use one of:

- `FIREBASE_CREDENTIALS_BASE64`
- `FIREBASE_CREDENTIALS_JSON`
- Application Default Credentials when explicitly enabled

Local credential JSON files should not be stored in the repo.

## Deployment

GitHub Actions are intentionally staged:

- `CI`: validation only.
- `Deploy Web`: build once, deploy Firebase test on push to `main`, production only by manual dispatch.
- `Ops Pipeline`: manual operational entry points for picks, emails, and scanner jobs.

Default Firebase targets:

- `FIREBASE_TEST_HOSTING_TARGET=newleaf-preview`
- `FIREBASE_HOSTING_TARGET=newleafsystem`

Cloudflare Pages and Google Cloud Run are manual optional jobs. They require repo variables/secrets before use.

## Scanner And Pipeline

Scanner scripts under `scanner/` should:

- Use `scanner/lib/config.js`.
- Validate required config by key name.
- Keep output under ignored report/log/output directories.
- Avoid absolute machine paths.

Pipeline scripts under `pipeline/` should:

- Use `lib/runtime-config.cjs` for Node or `pipeline/config_loader.py` for Python.
- Write generated reports to ignored output directories or external stores.
- Prefer dry-run modes for publishing changes.
- Avoid logging full URLs if they include tokens or signed credentials.

## Security

Never commit or print:

- Firebase private keys or service account JSON.
- Alpaca, R2, SMTP, XAI, Gemini, or other API keys.
- OAuth tokens or refresh tokens.
- `.env` values.
- Local absolute paths or machine-specific settings.

Use:

```bash
node scripts/scan-sensitive-candidates.cjs --all
```

before claiming commit readiness.

## Tests And Checks

Use these checks according to the changed files:

```bash
bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh
node --check path/to/file.js
python -m py_compile path/to/file.py
npm run build
node scripts/scan-sensitive-candidates.cjs --all
```

For Firebase Hosting target validation:

```bash
npx -y firebase-tools@latest deploy --project newleaf-trading --only hosting:newleaf-preview --dry-run
```
