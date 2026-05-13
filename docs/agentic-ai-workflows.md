# Agentic AI Workflows

This repo supports Codex, Claude Code, Cursor, and local repo-specific skills. All agents should follow the same implementation and safety rules.

## Agent Files

- `AGENTS.md`: primary Codex and cross-agent guide.
- `CLAUDE.md`: Claude Code summary and verification checklist.
- `SKILLS.md`: skill index and activation guidance.
- `.agents/skills/newleaf-client-web/SKILL.md`: repo-specific skill.
- `.cursor/rules/*.mdc`: Cursor rules for general, frontend, pipeline, and deployment/security work.
- `docs/implementation-patterns.md`: shared engineering patterns.

## Standard Workflow

1. Identify the feature area: frontend, workbench, pipeline, scanner, config, or deployment.
2. Read the nearest relevant files and the shared implementation docs.
3. Make the smallest change that satisfies the request.
4. Keep config environment-driven.
5. Run targeted checks.
6. Run the sensitive candidate scanner before commit-readiness.
7. Summarize changes, verification, and manual follow-up.

## Frontend Workflow

Use for changes under `src/`, `public/`, `workbench/`, `vite.config.js`, or CSS.

- Preserve route structure in `src/App.jsx`.
- Keep browser Firebase config in `VITE_FIREBASE_*`.
- Reuse existing layouts and components.
- Run `npm run build`.
- Check that raw workbench files still copy into `dist/workbench-static` and `/workbench/*` routes render through React.

## Pipeline Workflow

Use for changes under `pipeline/`, `scanner/`, `lib/`, and operational scripts.

- Use runtime loaders.
- Validate missing config by key name only.
- Do not print secrets.
- Prefer dry-runs for writes.
- Run syntax checks for changed JS/Python/shell files.

## Deployment Workflow

Use for `.github/workflows`, Firebase, Cloudflare, Google Cloud, or GitHub config helpers.

- Test deploy target: `newleaf-preview`.
- Production deploy target: `newleafsystem`.
- Production must be manual.
- Keep Cloudflare Pages and Cloud Run optional/manual unless the repo gains required config.
- Validate GitHub config sync with:

```bash
bash scripts/setup-github-actions-config.sh --dry-run --repo OWNER/REPO
```

Validate Firebase target mapping with:

```bash
npx -y firebase-tools@latest deploy --project newleaf-trading --only hosting:newleaf-preview --dry-run
```

## Commit Readiness Workflow

Before telling a user the repo is ready to commit:

```bash
git status --short --untracked-files=all
git diff --check
node scripts/scan-sensitive-candidates.cjs --all
```

Confirm `.env`, `.secrets`, generated outputs, and credential JSON files are ignored or absent.
