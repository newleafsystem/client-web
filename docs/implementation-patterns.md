# Implementation Patterns

This document is the implementation source of truth for agents and maintainers working in `client-web`. When logic, routing, build, deployment, runtime config, security posture, or architecture changes, update this file in the same change set.

The prior baseline is kept in [implementation-patterns-prior.md](implementation-patterns-prior.md). Before replacing a major pattern, preserve the previous guidance there or in a dated follow-up section so agents can see what changed.

## Architecture

`client-web` combines:

- A React/Vite public website and investor frontend.
- Static HTML workbench pages copied into the built site.
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
- `workbench`: standalone static HTML workbench pages copied to `dist/workbench`.

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
- Use `Footer` in every route surface. Layout shells should own footer placement when the page belongs to a route family.
- Use `src/trading/styles/brand.css` for canonical brand tokens. The official large-surface gradient is `--brand-gradient`; shared primary and secondary buttons use `--brand-button-*` variables or the `.nl-btn-primary` and `.nl-btn-secondary` helpers.
- Do not introduce one-off dark green gradients for large branded areas. Reuse `--brand-gradient` for header/footer-adjacent surfaces, hero bands, CTA bands, and product story sections.
- Do not use green or gradient-filled primary buttons. Primary actions use the solid muted-gold brand button token; secondary actions use the warm-ivory token with a muted-gold border.
- Use `src/shared/auth/accessControl.js` for product app ids, role ids, app-access normalization, and navigation filtering.
- Do not hand-maintain duplicate product navs inside page bodies.
- Do not use browser-native `alert`, `confirm`, or `prompt`. React pages must use `src/shared/components/NotificationProvider.jsx`; static Workbench pages must use `window.NewLeafModal` from `scripts/workbench-modal-runtime.js`.
- Keep public pages educational and risk-aware. Do not imply guaranteed profit, risk-free trades, or certainty.
- Firebase web config must come from `import.meta.env.VITE_FIREBASE_*`; do not hardcode Firebase API keys.

## Auth, Roles, And Product Access

User management is owned by `admin-web`. `client-web` consumes the shared Firebase Auth user and Firestore profile only.

Shared profile contract:

- Collection: `users/{uid}`.
- Database: Firebase project `newleaf-trading`, Firestore database `newleafdb`.
- Entitlement fields: `status`, `roles`, and `appAccess`.
- Canonical app ids: `invest`, `picks`, `workbench`, `admin`, `quant`, `desk`.

Patterns:

- `src/shared/hooks/useAuth.js` subscribes to `users/{uid}` and returns `user`, `profile`, `access`, and auth actions.
- `client-web` may create a missing user profile on first sign-in, but it must not overwrite existing `roles` or `appAccess`.
- `/register` and `/signin` are the canonical email/password and Google account entry points. Public CTAs should link to these routes instead of launching a Google-only popup.
- Firebase Auth must have Email/Password and Google enabled with one account per email address so a same-email Google attempt can be linked into the existing password account.
- Email/password registration writes `communicationEmail`, `emailVerified`, `identityProviderIds`, and `authProviders` alongside the conservative default entitlements.
- Google sign-in for an email that already has a password account must use Firebase provider linking, not a second Firestore profile. `src/shared/hooks/useAuth.js` throws `auth/google-link-password-required`; `LoginPage` asks for the existing password and then calls `linkGoogleWithPassword`.
- New non-admin users default to `roles: ['investor']` and only `appAccess.invest: true`.
- `sd.nirsha@gmail.com` and `manish28june@gmail.com` are immutable admins. They always receive admin role and all app access in client-web and admin-web.
- `VITE_ADMIN_EMAILS` is bootstrap fallback only. Once `admin-web` writes explicit `appAccess`, Firestore wins for env-only bootstrap admins.
- Disabled, inactive, revoked, or suspended profiles must not receive app access.
- `BrandBar` filters product navigation with `requiredApp` and `requiredRole` metadata from `src/shared/components/navConfig.js`.
- `AppAccessGate` blocks React route surfaces such as Picks, Workbench analysis, Invest, and the legacy client admin page.
- Static Workbench pages rely on the generated nav plus `scripts/workbench-nav-auth.js` for app-aware nav filtering and a Workbench access overlay.

See [access-control.md](access-control.md) for the shared admin-web/client-web schema and ownership rules.

## Navigation And Workbench

`BrandBar` is the canonical React navigation component for root, picks, workbench, and invest surfaces.

- Product/surface links live in `src/shared/components/navConfig.js`.
- Product links must carry `requiredApp` or `public` metadata; do not add product links that bypass `accessControl.js`.
- React workbench routes such as `/workbench/analysis` use `WorkbenchLayout`.
- Static workbench pages include `workbench/nav-component.html`.
- `workbench/nav-component.html` is generated by `scripts/build-workbench-nav.mjs`; do not hand-edit it.
- Workbench nav runtime behavior lives in `scripts/workbench-nav-runtime.js`.
- Workbench Firebase auth behavior lives in `scripts/workbench-nav-auth.js`.
- Static Workbench notification UI lives in `scripts/workbench-modal-runtime.js`.
- Static Workbench footer fallback lives in `scripts/workbench-footer-runtime.js`.
- Static Workbench URL normalization lives in `scripts/workbench-url-runtime.js`.
- User-facing Workbench links must be extensionless, for example `/workbench/stock?symbol=SPY` instead of `/workbench/stock.html?symbol=SPY`.

The build must not retain deleted static pages:

- `scripts/clean-spa.js` removes stale `dist/workbench/` before build.
- `vite.config.js` removes `dist/workbench/` again before copying `workbench/`.
- Browser credential/API test pages do not belong in hosted `workbench/`.

## Runtime Config

Runtime config is environment-driven.

- Browser config: `VITE_*` values from Vite env.
- Node config: `lib/env.cjs` and `lib/runtime-config.cjs`.
- Firebase Admin: `lib/firebase-admin.cjs`.
- Scanner config: `scanner/lib/config.js`.
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
- Production default domain: `newleafsystem.web.app`.

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
node scripts/build-workbench-nav.mjs
vite build
node scripts/build-extensionless-static.mjs
node scripts/prerender.js
```

`npm run build` runs the full sequence.

Patterns:

- Vite builds the React SPA into `dist/`.
- Static workbench HTML is copied into `dist/workbench/`.
- `scripts/build-extensionless-static.mjs` creates directory-index copies for static Workbench pages so `/workbench/page` works without `.html` on local previews and non-Firebase hosts.
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

Pipeline scripts under `pipeline/` should:

- Use `lib/runtime-config.cjs` for Node or `pipeline/config_loader.py` for Python.
- Prefer dry-run or preview modes for publishing changes.
- Write generated reports to ignored output directories or external stores.
- Avoid logging full URLs if they include tokens or signed credentials.
- Use `pipeline/templates/report.html` as the default report template.
- Use `pipeline/templates/report-portrait.html` for portrait report generation.
- Keep email HTML in `pipeline/templates/weekly-email-template.html`.

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
- Cloudflare Pages and Google Cloud Run jobs are optional manual jobs and require repo variables/secrets before use.
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

- Shell changes: `bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh`
- JS/CJS/MJS changes: `node --check <file>`
- Python changes: `python -m py_compile <file>`
- Frontend/config/build changes: `npm run build`
- Production naming hygiene: `npm run audit:hygiene`
- Staged commit safety: `node scripts/scan-sensitive-candidates.cjs --staged`
- Broad secret safety: `node scripts/scan-sensitive-candidates.cjs --all`
- GitHub workflow changes: parse YAML locally if PyYAML is available, then validate with a GitHub Actions run after commit.

Report what changed, what was verified, and any remaining manual steps. Do not expose secret values.
