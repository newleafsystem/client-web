const UI_CACHE_COOKIE = 'newleaf_auth_state';
const CACHE_VERSION = 1;

function ttlHours() {
  const value = Number(import.meta.env.VITE_AUTH_STATE_CACHE_TTL_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function sessionApiBase() {
  return String(import.meta.env.VITE_AUTH_SESSION_API_BASE_URL || '').replace(/\/+$/, '');
}

function sessionUrl(path) {
  return `${sessionApiBase()}${path}`;
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function cookieSecureFlag() {
  return isBrowser() && window.location.protocol === 'https:' ? '; Secure' : '';
}

function writeCookie(name, value, maxAgeSeconds) {
  if (!isBrowser()) return;
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'SameSite=Lax',
    cookieSecureFlag(),
  ].join('; ');
}

function readCookie(name) {
  if (!isBrowser()) return '';
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid || null,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    emailVerified: user.emailVerified === true,
  };
}

export function sanitizeProfile(profile) {
  if (!profile) return null;
  return {
    uid: profile.uid || null,
    email: profile.email || null,
    communicationEmail: profile.communicationEmail || null,
    displayName: profile.displayName || null,
    photoURL: profile.photoURL || null,
    emailVerified: profile.emailVerified === true,
    roles: Array.isArray(profile.roles) ? profile.roles : undefined,
    role: profile.role,
    roleMap: profile.roleMap,
    appAccess: profile.appAccess,
    apps: profile.apps,
    applications: profile.applications,
    productAccess: profile.productAccess,
    status: profile.status || (profile.disabled ? 'disabled' : 'active'),
    disabled: profile.disabled === true,
    immutable: profile.immutable === true,
  };
}

export function readCachedAuthState() {
  const raw = readCookie(UI_CACHE_COOKIE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed.version !== CACHE_VERSION) return null;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    if (!parsed.user?.uid) return null;
    return {
      user: sanitizeUser(parsed.user),
      profile: sanitizeProfile(parsed.profile),
      expiresAt: parsed.expiresAt,
      source: 'cookie-cache',
    };
  } catch {
    return null;
  }
}

export function writeCachedAuthState({ user, profile }) {
  const safeUser = sanitizeUser(user);
  if (!safeUser?.uid) {
    clearCachedAuthState();
    return;
  }

  const maxAgeSeconds = ttlHours() * 60 * 60;
  writeCookie(
    UI_CACHE_COOKIE,
    JSON.stringify({
      version: CACHE_VERSION,
      expiresAt: Date.now() + maxAgeSeconds * 1000,
      user: safeUser,
      profile: sanitizeProfile(profile),
    }),
    maxAgeSeconds
  );
}

export function clearCachedAuthState() {
  writeCookie(UI_CACHE_COOKIE, '', 0);
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return response.json();
}

export async function fetchCookieSession() {
  try {
    const response = await fetch(sessionUrl('/api/auth/session'), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data?.authenticated || !data.user?.uid) return null;
    return {
      user: sanitizeUser(data.user),
      profile: sanitizeProfile(data.profile),
      access: data.access || null,
      expiresAt: data.expiresAt || null,
      source: 'http-cookie',
    };
  } catch {
    return null;
  }
}

export async function createCookieSession(firebaseUser) {
  if (!firebaseUser?.getIdToken) return null;

  try {
    const idToken = await firebaseUser.getIdToken();
    const response = await fetch(sessionUrl('/api/auth/session'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data?.authenticated) return null;
    return {
      user: sanitizeUser(data.user),
      profile: sanitizeProfile(data.profile),
      access: data.access || null,
      expiresAt: data.expiresAt || null,
      source: 'http-cookie',
    };
  } catch {
    return null;
  }
}

export async function fetchCustomTokenFromCookie() {
  try {
    const response = await fetch(sessionUrl('/api/auth/custom-token'), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data?.customToken) return null;
    return data.customToken;
  } catch {
    return null;
  }
}

export async function clearCookieSession() {
  try {
    await fetch(sessionUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
  }
  clearCachedAuthState();
}
