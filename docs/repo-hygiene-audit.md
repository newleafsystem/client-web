# Repo Hygiene Audit

This repository ships a public-facing app, hosted workbench pages, and PDF/email pipeline templates. Production-facing files should use purpose-based names, not migration or iteration names.

## Production Naming Rules

- Do not keep files named with version suffixes such as `V7`, `v2`, or `v3` in `src/`, `public/`, `workbench/`, or `pipeline/templates/`.
- Do not keep source artifacts named `backup`, `old`, `bak`, `patch`, `tmp`, `temp`, `New`, or `Refactored` in production roots.
- Keep browser credential/API test pages out of hosted roots. Internal API testing should run from local scripts or authenticated admin tooling, not public static HTML.
- Historical planning documents can live under `docs/`, but runtime imports and hosted links should point to canonical filenames.

## Automated Check

Run:

```bash
npm run audit:hygiene
```

The audit scans production-facing roots only:

- `src/`
- `public/`
- `workbench/`
- `pipeline/templates/`

It reports paths only and does not inspect or print environment values.

## Current Cleanup

- Public home route now imports `LandingPage.jsx`, with styles in `landing.css`.
- Invest app routes now import `DiscoverPage.jsx` and `PerformancePage.jsx`.
- Dead page variants, backup files, old nav/header variants, unused mockup/versioned styles, and hosted Alpaca browser test pages were removed.
- PDF report templates now use purpose-based names: `report.html` and `report-portrait.html`.
