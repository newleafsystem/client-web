# Implementation Patterns

This document is the implementation source of truth for agents and maintainers working in `client-web`.

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
