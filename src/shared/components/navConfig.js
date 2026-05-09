/**
 * navConfig.js — Centralised navigation configuration
 *
 * Consumed by BrandBar (React) and referenced when updating
 * nav-component.html (Workbench static pages).
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

// ─── Surface configuration ───────────────────────────────────

export const surfaceConfig = {
  root: {
    ariaLabel: 'NewLeaf System navigation',
    brandSuffix: 'System',
    sections: [
      { kind: 'link', label: 'Picks', href: '/picks', requiredApp: APP_IDS.PICKS },
      { kind: 'link', label: 'Workbench', href: '/workbench/', requiredApp: APP_IDS.WORKBENCH },
      { kind: 'link', label: 'Invest', href: '/invest', requiredApp: APP_IDS.INVEST, public: true },
      { kind: 'link', label: 'Blog', href: '/blog', public: true },
      { kind: 'dropdown', label: 'How it works', items: HOW_IT_WORKS_ITEMS, dark: true, public: true },
    ],
    showSwitcher: true,
    builderCta: true,
  },

  picks: {
    ariaLabel: 'NewLeaf Picks navigation',
    brandSuffix: 'Picks',
    sections: [
      { kind: 'link', label: 'Picks', href: '/picks', requiredApp: APP_IDS.PICKS },
      { kind: 'link', label: 'Performance', href: '/picks/recap', requiredApp: APP_IDS.PICKS },
      { kind: 'dropdown', label: 'How it works', items: HOW_IT_WORKS_ITEMS, dark: true, public: true },
    ],
    showSwitcher: true,
  },

  workbench: {
    ariaLabel: 'NewLeaf Workbench navigation',
    brandSuffix: 'Workbench',
    sections: [
      { kind: 'link', label: 'Hub', href: '/workbench/', requiredApp: APP_IDS.WORKBENCH },
      { kind: 'link', label: 'Scanner', href: '/workbench/all-stocks', requiredApp: APP_IDS.WORKBENCH },
      { kind: 'dropdown', label: 'Strategies', items: WORKBENCH_STRATEGIES, dark: true, requiredApp: APP_IDS.WORKBENCH },
      { kind: 'link', label: 'Watchlist', href: '/workbench/watchlist', requiredApp: APP_IDS.WORKBENCH },
      { kind: 'link', label: 'Analysis', href: '/workbench/analysis', requiredApp: APP_IDS.WORKBENCH },
      { kind: 'link', label: 'Projection', href: '/workbench/projection', requiredApp: APP_IDS.WORKBENCH },
    ],
    showSwitcher: true,
    statusType: 'live',
  },

  invest: {
    ariaLabel: 'NewLeaf Invest navigation',
    brandSuffix: 'Invest',
    sections: [
      { kind: 'link', label: 'Home', href: '/invest', requiredApp: APP_IDS.INVEST },
      { kind: 'link', label: 'Discover', href: '/invest/discover', requiredApp: APP_IDS.INVEST },
      { kind: 'link', label: 'Build', href: '/invest/build', requiredApp: APP_IDS.INVEST },
      { kind: 'link', label: 'Positions', href: '/invest/positions', requiredApp: APP_IDS.INVEST },
      { kind: 'link', label: 'Performance', href: '/invest/performance', requiredApp: APP_IDS.INVEST },
      { kind: 'link', label: 'Admin', href: '/invest/admin', requiredApp: APP_IDS.ADMIN },
    ],
    // Logged-out: cross-product links until marketing routes (Overview / Pricing) exist
    sectionsOut: [
      { kind: 'link', label: 'Invest', href: '/invest', requiredApp: APP_IDS.INVEST, public: true },
      { kind: 'dropdown', label: 'How it works', items: HOW_IT_WORKS_ITEMS, dark: true, public: true },
    ],
    showSwitcher: true,
    statusType: 'market',
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
