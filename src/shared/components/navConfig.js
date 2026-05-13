/**
 * navConfig.js — Centralised navigation configuration
 *
 * Consumed by BrandBar (React) and the cached navigation state.
 *
 * NavItem types:
 *   { kind: 'link',     label, href, requiredApp?, requiredRole?, public? }
 *   { kind: 'dropdown', label, items, dark?, requiredApp?, requiredRole?, public? }
 *
 * DropdownItem types:
 *   { label, href }                  — regular link
 *   { label, href, accent: true }    — accented / highlighted link
 *   { divider: true }                — horizontal rule
 *   { heading: string }              — category heading (non-clickable)
 */

import { APP_IDS } from '../auth/accessControl';

// ─── Shared dropdown item lists ──────────────────────────────

export const HOW_IT_WORKS_ITEMS = [
  { label: 'How we pick trades', href: '/how-we-pick' },
  { label: 'Why we recommend them', href: '/how-we-recommend' },
  { label: 'How we manage them', href: '/how-we-manage' },
  { label: 'Track record', href: '/track-record' },
  { divider: true },
  { label: 'Scoring algorithm', href: '/how-we-score' },
  { label: 'Probability engine', href: '/probability-engine' },
  { label: 'Strategy selection', href: '/strategy-selection' },
  { label: 'Technical analysis', href: '/technical-analysis' },
  { label: 'Gamma wall analysis', href: '/gamma-analysis' },
  { label: 'AI sentiment analysis', href: '/ai-sentiment' },
  { label: 'NewLeaf Invest AI', href: '/ai-portfolio' },
  { divider: true },
  { label: 'Verification Desk', href: '/verification-desk' },
];

export const WORKBENCH_STRATEGIES = [
  { heading: 'Income Strategies' },
  { label: 'Cash-Secured Puts', href: '/workbench/sell-puts' },
  { label: 'The Wheel', href: '/workbench/wheel' },
  { label: 'Iron Condor', href: '/workbench/condor-scanner' },
  { label: 'Broken Wing Butterfly', href: '/workbench/broken-wing' },
  { divider: true },
  { heading: 'Spread Strategies' },
  { label: 'Bull Put Spread', href: '/workbench/bull-put' },
  { label: 'Bear Call Spread', href: '/workbench/bear-call' },
  { label: 'Bull Call Spread', href: '/workbench/bull-call' },
  { label: 'Bear Put Spread', href: '/workbench/bear-put' },
  { label: 'Calendar Spread', href: '/workbench/calendar' },
  { divider: true },
  { label: '\u2699 Strategy Builder \u2192', href: '/workbench/strategy-builder', accent: true },
];

function requireAppForLinks(items, appId) {
  return items.map((item) => (
    item.href ? { ...item, requiredApp: item.requiredApp || appId } : item
  ));
}

export const PICKS_ITEMS = [
  { label: 'Weekly recap', href: '/picks/recap', requiredApp: APP_IDS.PICKS },
  { label: 'Monthly performance', href: '/picks/monthly', requiredApp: APP_IDS.PICKS },
];

export const WORKBENCH_ITEMS = [
  { label: 'Stock scanner', href: '/workbench/all-stocks', requiredApp: APP_IDS.WORKBENCH },
  { label: 'Watchlist', href: '/workbench/watchlist', requiredApp: APP_IDS.WORKBENCH },
  { label: 'Analysis', href: '/workbench/analysis', requiredApp: APP_IDS.WORKBENCH },
  { label: 'Projection', href: '/workbench/projection', requiredApp: APP_IDS.WORKBENCH },
  { divider: true },
  ...requireAppForLinks(WORKBENCH_STRATEGIES, APP_IDS.WORKBENCH),
];

export const INVEST_ITEMS = [
  { label: 'Discover', href: '/invest/discover', requiredApp: APP_IDS.INVEST },
  { label: 'Build trade', href: '/invest/build', requiredApp: APP_IDS.INVEST },
  { label: 'Positions', href: '/invest/positions', requiredApp: APP_IDS.INVEST },
  { label: 'Performance', href: '/invest/performance', requiredApp: APP_IDS.INVEST },
  { label: 'Admin console', href: '/invest/admin', requiredApp: APP_IDS.ADMIN },
];

export const QUANT_ITEMS = [
  { label: 'Scoring algorithm', href: '/how-we-score', public: true },
  { label: 'Probability engine', href: '/probability-engine', public: true },
  { label: 'Technical analysis', href: '/technical-analysis', public: true },
  { label: 'Gamma wall analysis', href: '/gamma-analysis', public: true },
];

export const DESK_ITEMS = [
  { label: 'Verification Desk', href: '/verification-desk', public: true },
];

export const MAIN_NAV_SECTIONS = [
  { kind: 'dropdown', label: 'Picks', href: '/picks', items: PICKS_ITEMS, dark: true, public: true, activePrefixes: ['/picks'] },
  { kind: 'dropdown', label: 'Workbench', href: '/workbench/', items: WORKBENCH_ITEMS, dark: true, public: true, activePrefixes: ['/workbench'] },
  { kind: 'dropdown', label: 'Invest', href: '/invest', items: INVEST_ITEMS, dark: true, public: true, activePrefixes: ['/invest', '/strategies'] },
  { kind: 'dropdown', label: 'Quant', href: '/quant', items: QUANT_ITEMS, dark: true, public: true, activePrefixes: ['/quant', '/how-we-score', '/probability-engine', '/technical-analysis', '/gamma-analysis'] },
  { kind: 'dropdown', label: 'Desk', href: '/desk', items: DESK_ITEMS, dark: true, public: true, activePrefixes: ['/desk', '/verification-desk'] },
  { kind: 'link', label: 'Blog', href: '/blog', public: true },
  { kind: 'dropdown', label: 'How it works', items: HOW_IT_WORKS_ITEMS, dark: true, public: true, activePrefixes: ['/how-we', '/track-record', '/ai-sentiment', '/ai-portfolio'] },
];

// ─── Surface configuration ───────────────────────────────────

export const surfaceConfig = {
  root: {
    ariaLabel: 'NewLeaf System navigation',
    brandSuffix: 'System',
    sections: MAIN_NAV_SECTIONS,
    showSwitcher: true,
  },

  picks: {
    ariaLabel: 'NewLeaf Picks navigation',
    brandSuffix: 'System',
    sections: MAIN_NAV_SECTIONS,
    showSwitcher: true,
  },

  workbench: {
    ariaLabel: 'NewLeaf Workbench navigation',
    brandSuffix: 'System',
    sections: MAIN_NAV_SECTIONS,
    showSwitcher: true,
  },

  invest: {
    ariaLabel: 'NewLeaf Invest navigation',
    brandSuffix: 'System',
    sections: MAIN_NAV_SECTIONS,
    showSwitcher: true,
  },
};

// ─── Product switcher entries ────────────────────────────────

export const switcherProducts = [
  { key: 'picks', label: 'Picks', description: 'Weekly trade recommendations', href: '/picks', requiredApp: APP_IDS.PICKS },
  { key: 'workbench', label: 'Workbench', description: 'Strategy scanner & analysis', href: '/workbench/', requiredApp: APP_IDS.WORKBENCH },
  { key: 'invest', label: 'Invest', description: 'Portfolio management & execution', href: '/invest', requiredApp: APP_IDS.INVEST },
  { key: 'quant', label: 'Quant', description: 'AI research & scoring engine', href: '/quant', requiredApp: APP_IDS.QUANT },
  { key: 'desk', label: 'Desk', description: 'Execution & order management', href: '/desk', requiredApp: APP_IDS.DESK },
];
