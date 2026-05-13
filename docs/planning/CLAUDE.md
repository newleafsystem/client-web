# NewLeaf System - Claude Code Guidelines

## Critical Rules

### Never edit `dist/`

The `dist/` directory is build output. Never create, edit, or copy files there directly.

- `vite build` generates the React shell in `dist/`.
- Static assets go in `public/`; Vite copies them to `dist/`.
- The `copyStaticApps` plugin in `vite.config.js` copies raw `workbench/` HTML to `dist/workbench-static/`.
- User-facing `/workbench/*` routes are React routes, not copied HTML files.
- `server.cjs` serves from `dist/` at localhost:3000.

### Do Not Reintroduce Static Workbench Navigation

Workbench header, footer, auth state, and role-aware navigation are owned by React:

- `src/shared/components/BrandBar.jsx`
- `src/shared/components/WorkbenchLayout.jsx`
- `src/shared/components/WorkbenchStaticPage.jsx`
- `src/shared/components/navigationState.js`

Raw Workbench HTML under `workbench/` is embedded content only. Do not generate `nav-component.html`, static Workbench auth overlays, static footer fallbacks, or extensionless static page copies.

## Architecture

### One Navigation System

- React `BrandBar` is the only user-facing navigation system.
- `src/shared/components/navConfig.js` is the navigation source of truth.
- `src/shared/components/navigationState.js` caches role-filtered navigation JSON after login.
- Logout must clear cached auth and navigation state.

### Workbench Runtime

- `/workbench/*` routes render through `WorkbenchLayout`.
- Legacy HTML tools are embedded from `/workbench-static/*.html` by `WorkbenchStaticPage`.
- `workbench/load-nav.js` is only an embedded content runtime for data loading UI, modal helpers, iframe sizing, and link bridging.

### Dev Servers

- `node server.cjs` -> localhost:3000, serves from `dist/`, includes API proxy.
- `npm run dev` -> localhost:5173, serves the React SPA with HMR.

### Build Pipeline

1. `node scripts/clean-spa.js`
2. `vite build`
3. `node scripts/prerender.js`

## Code Patterns

- Firebase config: `src/firebase/config.js`
- Shared hooks: `src/shared/hooks/`
- Marketing pages: `src/marketing/`
- Trading/Invest pages: `src/trading/`
- Picks pages: `src/picks/`
