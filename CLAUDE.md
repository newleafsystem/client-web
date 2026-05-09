# CLAUDE.md

Claude Code guide for `client-web`.

## Mission

Work as a pragmatic engineering assistant for NewLeaf System. Keep changes focused, verify them, and protect secrets. This repo serves the public NewLeaf System site, investor/trading pages, static workbench, scanner, report pipeline, and deployment automation.

## Read First

- `AGENTS.md`
- `README.md`
- `docs/implementation-patterns.md`
- `docs/agentic-ai-workflows.md`
- `SKILLS.md`

## Non-Negotiables

- Never expose `.env` values, Firebase service account contents, Alpaca keys, R2 keys, SMTP credentials, or API keys.
- Never recreate or commit legacy credential JSON files.
- Do not commit generated folders such as `dist/`, `pipeline/output/`, scanner reports/logs, `.firebase/`, `.claude/`, or backup files.
- Keep `.env.example` as key names and placeholders only.
- Test deploys use Firebase Hosting target `newleaf-preview`.
- Production deploys use `newleafsystem` only through explicit manual workflow dispatch.
- Do not make financial claims that imply guaranteed returns, no risk, or certainty.

## Implementation Style

- Preserve the existing React/Vite app structure.
- Prefer existing helpers over new abstractions.
- Use `import.meta.env.VITE_FIREBASE_*` for browser Firebase config.
- Use `lib/runtime-config.cjs`, `lib/firebase-admin.cjs`, `scanner/lib/config.js`, and `pipeline/config_loader.py` for server/script config.
- Keep scripts repo-relative; avoid absolute local paths.
- Add dry-run or preview modes for risky pipeline changes where practical.

## Verification

Use the narrowest checks that cover the change:

```bash
bash -n scripts/*.sh scripts/scanner/*.sh scanner/yahoo-svc/start.sh
node --check path/to/file.js
python -m py_compile path/to/file.py
npm run build
node scripts/scan-sensitive-candidates.cjs --all
```

For deployment changes, validate command shape with dry runs where available. Firebase test target validation:

```bash
npx -y firebase-tools@latest deploy --project newleaf-trading --only hosting:newleaf-preview --dry-run
```

## Response Expectations

Lead with concrete outcomes. Mention changed files and checks run. Call out manual steps such as setting GitHub variables/secrets or running a workflow. Never include secret values.
