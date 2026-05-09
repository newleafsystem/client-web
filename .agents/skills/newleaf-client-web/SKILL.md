---
name: newleaf-client-web
description: Work safely in the NewLeaf System client-web repo, including React/Vite frontend, Firebase Hosting, Firestore/R2 pipelines, scanner scripts, and deployment automation.
---

# NewLeaf Client Web Skill

Use this skill when a task touches `client-web` application code, deployment, runtime config, scanner/pipeline scripts, or agent setup.

## Required Context

Read:

- `AGENTS.md`
- `docs/implementation-patterns.md`
- `README.md`

For deployment changes, also read:

- `.github/workflows/deploy-web.yml`
- `.firebaserc`
- `firebase.json`
- `scripts/setup-github-actions-config.sh`

## Safety Rules

- Do not print or commit secret values.
- Do not read or summarize `.env` values unless migrating key names or checking presence.
- Do not recreate legacy JSON credential/config files.
- Keep new config in `.env.example` and GitHub variables/secrets.
- Test Firebase deploys against `newleaf-preview` first.
- Production deploys to `newleafsystem` must be manual and explicit.

## Implementation Rules

- Frontend: keep route composition in `src/App.jsx`, preserve lazy imports, and reuse layouts/components.
- Browser Firebase: use `import.meta.env.VITE_FIREBASE_*`.
- Node runtime config: use `lib/runtime-config.cjs`.
- Firebase Admin: use `lib/firebase-admin.cjs`.
- Scanner config: use `scanner/lib/config.js`.
- Python pipeline config: use `pipeline/config_loader.py`.
- Scripts: use repo-relative paths.

## Verification

Run only relevant checks, then always run the sensitive scan before commit-readiness:

```bash
bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh
node --check path/to/file.js
python -m py_compile path/to/file.py
npm run build
node scripts/scan-sensitive-candidates.cjs --all
```

Firebase test deploy validation:

```bash
npx -y firebase-tools@latest deploy --project newleaf-trading --only hosting:newleaf-preview --dry-run
```
