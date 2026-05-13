import { filterNavSections, normalizeUserAccess } from '../auth/accessControl';
import { FOOTER_PRODUCT_LABELS, FOOTER_STATIC_SECTIONS } from './footerConfig';
import { surfaceConfig } from './navConfig';

export const NAVIGATION_CACHE_KEY = 'newleaf_navigation_state';

const CACHE_VERSION = 1;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function ttlHours() {
  const value = Number(import.meta.env.VITE_AUTH_STATE_CACHE_TTL_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function expiresAt() {
  return Date.now() + ttlHours() * 60 * 60 * 1000;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function authStateFor(user, authState) {
  return authState === 'in' && user?.uid ? 'in' : 'out';
}

function appAccessFor(profile, user, access) {
  return access || normalizeUserAccess(profile, user);
}

export function footerSectionsFromHeader(headerSections) {
  const productLabels = new Set(FOOTER_PRODUCT_LABELS);
  const platformLinks = (headerSections || [])
    .filter((item) => productLabels.has(item.label) && item.href)
    .map((item) => ({ label: item.label, href: item.href }));

  return [
    {
      title: 'Platform',
      links: platformLinks,
    },
    ...FOOTER_STATIC_SECTIONS,
  ];
}

export function buildNavigationState({ user = null, profile = null, access = null, authState = 'out' } = {}) {
  const effectiveAccess = appAccessFor(profile, user, access);
  const navAuthState = authStateFor(user, authState);
  const surfaces = Object.fromEntries(
    Object.entries(surfaceConfig).map(([surface, config]) => [
      surface,
      {
        headerSections: clone(filterNavSections(config.sections, effectiveAccess, { authState: navAuthState })),
      },
    ])
  );

  return {
    version: CACHE_VERSION,
    userUid: user?.uid || null,
    authState: navAuthState,
    createdAt: Date.now(),
    expiresAt: expiresAt(),
    accessSource: effectiveAccess.source || null,
    surfaces,
    footerSections: clone(footerSectionsFromHeader(surfaces.root?.headerSections || [])),
  };
}

export function readCachedNavigationState(userUid) {
  if (!isBrowser() || !userUid) return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(NAVIGATION_CACHE_KEY) || 'null');
    if (!parsed || parsed.version !== CACHE_VERSION) return null;
    if (parsed.userUid !== userUid) return null;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedNavigationState({ user = null, profile = null, access = null } = {}) {
  if (!isBrowser()) return;

  if (!user?.uid) {
    clearCachedNavigationState();
    return;
  }

  try {
    const state = buildNavigationState({ user, profile, access, authState: 'in' });
    window.localStorage.setItem(NAVIGATION_CACHE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('newleaf:navigation-cache', { detail: { userUid: user.uid } }));
  } catch {
  }
}

export function clearCachedNavigationState() {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(NAVIGATION_CACHE_KEY);
    window.dispatchEvent(new CustomEvent('newleaf:navigation-cache', { detail: { cleared: true } }));
  } catch {
  }
}

export function selectHeaderSections({
  surface = 'root',
  sections = null,
  user = null,
  profile = null,
  access = null,
  authState = 'out',
  useCache = true,
} = {}) {
  const config = surfaceConfig[surface] || surfaceConfig.root;
  const baseSections = sections || config.sections;
  const navAuthState = authStateFor(user, authState);

  if (useCache && navAuthState === 'in') {
    const cached = readCachedNavigationState(user.uid);
    const cachedSections = cached?.surfaces?.[surface]?.headerSections;
    if (Array.isArray(cachedSections) && cachedSections.length > 0) {
      return cachedSections;
    }
  }

  return filterNavSections(baseSections, appAccessFor(profile, user, access), { authState: navAuthState });
}

export function selectFooterSections({
  user = null,
  profile = null,
  access = null,
  authState = 'out',
} = {}) {
  const navAuthState = authStateFor(user, authState);

  if (navAuthState === 'in') {
    const cached = readCachedNavigationState(user.uid);
    if (Array.isArray(cached?.footerSections) && cached.footerSections.length > 0) {
      return cached.footerSections;
    }
  }

  return footerSectionsFromHeader(selectHeaderSections({
    surface: 'root',
    user,
    profile,
    access,
    authState,
    useCache: false,
  }));
}
