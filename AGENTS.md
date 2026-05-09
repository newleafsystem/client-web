# AGENTS.md

Repository guide for Codex and other AI coding agents working on `client-web`.

## Project Overview

NewLeaf System `client-web` is a public website, investor/trading interface, static workbench, and data publishing pipeline for options intelligence. It combines a Vite/React frontend with Firebase Hosting, Firestore-backed publishing workflows, Cloudflare R2 report storage, and scanner/report generation scripts.

The primary hosted site is `newleafsystem.com`. Deployment must be tested on Firebase Hosting site `newleaf-preview` before production site `newleafsystem`.

## Actual Stack

- Runtime: Node.js 20+.
- Package manager: npm.
- Frontend: React 18 + Vite.
- Routing: `react-router-dom`.
- Styling: CSS files under `src/trading/styles`, `src/blog/styles`, shared component CSS, and Tailwind/PostCSS config.
- Firebase client SDK: `src/firebase/config.js` using `VITE_FIREBASE_*`.
- Firebase Admin: `lib/firebase-admin.cjs`, `lib/runtime-config.cjs`, and `.env`/runtime env.
- Scanner: Node scripts under `scanner/`, with scanner-local `package.json`.
- Pipeline: Node and Python scripts under `pipeline/`.
- Storage: Cloudflare R2 through S3-compatible clients.
- Hosting: Firebase Hosting targets `newleaf-preview` and `newleafsystem`.
- Optional deploy targets: Cloudflare Pages and Google Cloud Run via manual GitHub Actions jobs.

## Repository Map

```text
src/
  App.jsx                         Route composition
  firebase/                       Firebase web SDK setup
  trading/                        Investor/product app pages, components, hooks, styles
  marketing/                      Public marketing and explanation pages
  picks/                          Weekly picks and analysis pages
  blog/                           Blog layout and posts
  shared/                         Shared layouts, nav, SEO, hooks

workbench/                        Static HTML workbench pages copied into dist
public/                           Static public assets and policy pages
pipeline/                         Weekly picks, report, email, PDF, and R2 scripts
scanner/                          Market scanner, R2 sync, Firestore sync, schedulers
lib/                              Env, runtime config, Firebase Admin helpers
scripts/                          Local scripts, CI/deploy helpers, scanner wrappers
docs/                             Architecture, implementation, planning, design docs
.github/workflows/                CI, deploy, and manual ops workflows
.cursor/rules/                    Cursor agent rules
.agents/skills/                   Repo-specific Codex skills
```

## First Reads

Before changing behavior, read the nearest relevant source files and:

- [README.md](README.md)
- [docs/implementation-patterns.md](docs/implementation-patterns.md)
- [docs/agentic-ai-workflows.md](docs/agentic-ai-workflows.md)
- [docs/design-system.md](docs/design-system.md)
- [SKILLS.md](SKILLS.md)

## Core Rules

- Never read, print, paste, summarize, or commit secrets from `.env`, `.secrets`, Firebase service account JSON, Alpaca config JSON, R2 credentials, SMTP credentials, API keys, or provider tokens.
- Runtime config must come from environment variables and `.env.example`, not legacy JSON credential files.
- Keep `.env` local and ignored. Add only key names and placeholders to `.env.example`.
- Do not reintroduce `scanner/config.json`, the old Alpaca JSON config file under `pipeline/`, or Firebase service account JSON files.
- Do not commit generated output: `dist/`, `pipeline/output/`, scanner reports/logs, `.firebase/`, `.claude/`, `.DS_Store`, or backup files.
- Firebase Hosting deploys must test `newleaf-preview` first. Production `newleafsystem` deploys are manual and explicit.
- Financial/options content must stay educational and risk-aware. Do not imply guaranteed profit, risk-free trades, or certainty.

## Frontend Patterns

- Keep routes in `src/App.jsx` unless a feature already owns nested routing.
- Use existing layouts: `PublicLayout`, `TradingLayout`, `WorkbenchLayout`, and `PicksLayout`.
- Place public product/marketing pages under `src/marketing` or the existing product page folders.
- Place investor app work under `src/trading`.
- Place reusable navigation, auth, SEO, and shell components under `src/shared`.
- Firebase web config must use `import.meta.env.VITE_FIREBASE_*`; do not hardcode Firebase API keys.
- The admin/investor UI should be compact, scan-friendly, and operational. Avoid marketing-style heroes inside tool surfaces.
- Preserve existing lazy-loading and route-splitting patterns in `src/App.jsx`.

## Pipeline And Scanner Patterns

- Use `lib/runtime-config.cjs`, `lib/firebase-admin.cjs`, `scanner/lib/config.js`, and `pipeline/config_loader.py` for config.
- Do not add new direct JSON credential readers.
- Scripts that write Firestore or R2 should validate required env keys and fail with key names only.
- Keep generated reports and scanner output out of git.
- Prefer dry-run or preview modes when adding pipeline entry points.
- For Python scripts, keep config parsing in `pipeline/config_loader.py`.
- For scanner scripts, keep env mapping in `scanner/lib/config.js`.

## Deployment Patterns

- CI workflow: syntax checks, sensitive candidate scan, and Vite build.
- Web deploy workflow:
  - push to `main` deploys Firebase test target `FIREBASE_TEST_HOSTING_TARGET`, default `newleaf-preview`.
  - production deploy requires manual dispatch with `deploy_environment=production`.
  - production target is `FIREBASE_HOSTING_TARGET`, default `newleafsystem`.
- Cloudflare Pages and Google Cloud Run jobs are manual because the repo does not have mandatory Cloudflare Pages or Cloud Run production config.
- GitHub variables/secrets should be loaded with `scripts/setup-github-actions-config.sh`; do not print values.

## Commands

```bash
npm install
npm install --prefix scanner
npm run build
bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh
node scripts/scan-sensitive-candidates.cjs --all
bash scripts/setup-github-actions-config.sh --dry-run --repo OWNER/REPO
```

Pipeline examples:

```bash
npm run picks:preview
npm run picks:close
npm run email:preview
node scanner/newleaf-pipeline.js --watchlist
```

## Verification Before Finishing

Run the strongest cheap checks available for the change:

- Shell changes: `bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh`
- JS/CJS/MJS changes: `node --check <file>`
- Python changes: `python -m py_compile <file>`
- Frontend/config changes: `npm run build`
- Secret safety: `node scripts/scan-sensitive-candidates.cjs --all`
- GitHub workflow changes: parse YAML locally if PyYAML is available, then validate with a GitHub Actions run after commit.

Report what changed, what was verified, and any remaining manual steps. Do not commit unless explicitly asked.
