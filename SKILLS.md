# SKILLS.md

Repo-specific skill map for agents working in `client-web`.

## Available Local Skill

### `newleaf-client-web`

Path: `.agents/skills/newleaf-client-web/SKILL.md`

Use this skill when changing:

- React/Vite routes, layouts, marketing pages, investor pages, blog pages, or workbench integration.
- Firebase web or admin config.
- Scanner, pipeline, R2, Firestore, email, or sentiment scripts.
- GitHub Actions, Firebase Hosting, Cloudflare Pages, or Google Cloud Run automation.
- Secret handling, `.env.example`, `.gitignore`, or commit-readiness checks.

## External Domain Skills To Consider

Use installed Firebase skills when the task requires Firebase-specific behavior:

- Firebase Hosting: deploy targets, preview/test hosting, rewrites, headers.
- Firestore: database reads/writes, indexes, security rules, data model changes.
- Firebase Auth: authentication flows or provider behavior.

Use general coding workflow skills only when they directly match the task. Do not invent new tool-specific behavior that conflicts with this repo guide.

## Standard Skill Workflow

1. Read `AGENTS.md`.
2. Read `.agents/skills/newleaf-client-web/SKILL.md`.
3. Inspect nearest relevant files before editing.
4. Make focused changes.
5. Run checks appropriate to the change.
6. Run `node scripts/scan-sensitive-candidates.cjs --all` before commit-readiness claims.

## Safety Defaults

- Treat `.env`, `.secrets`, and credential JSON files as unreadable unless the user explicitly requests sanitized key-name migration.
- Do not print secret values.
- Prefer environment variables and GitHub secrets/variables over local files.
- Keep deploys pointed at test targets until production is explicitly requested.
