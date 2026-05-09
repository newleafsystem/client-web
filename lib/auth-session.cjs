'use strict';

const IMMUTABLE_ADMIN_EMAILS = Object.freeze([
  'sd.nirsha@gmail.com',
  'manish28june@gmail.com',
]);

const ACCESS_APP_IDS = Object.freeze([
  'picks',
  'workbench',
  'invest',
  'admin',
  'quant',
  'desk',
]);

const DISABLED_STATUSES = new Set(['disabled', 'inactive', 'revoked', 'suspended']);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function boolValue(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeKey).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map(normalizeKey).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => boolValue(enabled))
      .map(([key]) => normalizeKey(key))
      .filter(Boolean);
  }
  return [];
}

function normalizeBooleanMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, enabled]) => [normalizeKey(key), boolValue(enabled)])
      .filter(([key]) => key)
  );
}

function bootstrapAdminEmails() {
  return [...new Set([...IMMUTABLE_ADMIN_EMAILS, ...normalizeList(process.env.VITE_ADMIN_EMAILS)])];
}

function isImmutableAdminUser(user) {
  const email = normalizeKey(user && user.email);
  return Boolean(email && IMMUTABLE_ADMIN_EMAILS.includes(email));
}

function isBootstrapAdminUser(user) {
  const email = normalizeKey(user && user.email);
  return Boolean(email && bootstrapAdminEmails().includes(email));
}

function allAppAccess(enabled = true) {
  return Object.fromEntries(ACCESS_APP_IDS.map((appId) => [appId, enabled]));
}

function defaultAppAccessForUser(user) {
  if (isBootstrapAdminUser(user)) return allAppAccess(true);
  return {
    picks: false,
    workbench: false,
    invest: true,
    admin: false,
    quant: false,
    desk: false,
  };
}

function normalizeUserAccess(profile, user) {
  const hasProfile = Boolean(profile && typeof profile === 'object');
  const rawRoles = hasProfile ? profile.roles || profile.roleMap || profile.role : null;
  const roleList = normalizeList(rawRoles);
  const roleMap = Object.fromEntries(roleList.map((role) => [role, true]));
  const bootstrapAdmin = isBootstrapAdminUser(user);
  const immutableAdmin = isImmutableAdminUser(user);

  if (immutableAdmin || (bootstrapAdmin && roleList.length === 0)) {
    roleMap.admin = true;
  }

  if (user && Object.keys(roleMap).length === 0) {
    roleMap.investor = true;
  }

  const explicitAppAccess =
    hasProfile &&
    (profile.appAccess || profile.apps || profile.applications || profile.productAccess);
  let appMap = normalizeBooleanMap(explicitAppAccess);

  if (immutableAdmin) {
    appMap = allAppAccess(true);
  } else if (!explicitAppAccess) {
    if (bootstrapAdmin || roleMap.admin) {
      appMap = allAppAccess(true);
    } else if (user) {
      appMap = defaultAppAccessForUser(user);
    }
  }

  const status = normalizeKey((profile && profile.status) || (profile && profile.disabled ? 'disabled' : 'active'));
  const disabled = !immutableAdmin && ((profile && profile.disabled === true) || DISABLED_STATUSES.has(status));

  if (disabled) {
    appMap = allAppAccess(false);
  }

  const access = {
    disabled,
    status: immutableAdmin ? 'active' : status || 'active',
    roles: Object.keys(roleMap),
    roleMap,
    apps: Object.keys(appMap).filter((appId) => appMap[appId]),
    appMap,
    immutable: immutableAdmin,
    source: immutableAdmin ? 'immutable-admin' : explicitAppAccess ? 'profile' : bootstrapAdmin ? 'bootstrap-env' : user ? 'client-default' : 'anonymous',
  };
  access.isAdmin = Boolean(roleMap.admin || appMap.admin);
  return access;
}

function sessionMaxAgeMs(config) {
  const hours = Number(config && config.maxAgeHours);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return Math.round(safeHours * 60 * 60 * 1000);
}

function sessionMaxAgeSeconds(config) {
  return Math.round(sessionMaxAgeMs(config) / 1000);
}

function sessionCookieName(config) {
  return (config && config.cookieName) || '__Host-newleaf_session';
}

function serializeCookie(name, value, config, options = {}) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${(config && config.sameSite) || 'Lax'}`,
  ];

  if (config && config.secure !== false) parts.push('Secure');
  if (options.clear) parts.push('Max-Age=0');
  else parts.push(`Max-Age=${sessionMaxAgeSeconds(config)}`);

  return parts.join('; ');
}

function createSessionSetCookie(value, config) {
  return serializeCookie(sessionCookieName(config), value, config);
}

function createSessionClearCookie(config) {
  return serializeCookie(sessionCookieName(config), '', config, { clear: true });
}

function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return cookies;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function readSessionCookie(req, config) {
  return parseCookies(req.headers.cookie)[sessionCookieName(config)] || '';
}

function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes || 1024 * 1024;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON request body.'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeUserFromDecoded(decoded) {
  if (!decoded || !decoded.uid) return null;
  return {
    uid: decoded.uid,
    email: decoded.email || null,
    displayName: decoded.name || null,
    photoURL: decoded.picture || null,
    emailVerified: decoded.email_verified === true,
  };
}

function sanitizeProfile(profile, uid) {
  if (!profile) return null;
  return {
    uid,
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

async function loadSessionProfile(db, uid) {
  if (!db || !uid) return null;
  const snapshot = await db.collection('users').doc(uid).get();
  return snapshot.exists ? sanitizeProfile(snapshot.data(), snapshot.id) : null;
}

function createSessionPayload(decoded, profile) {
  const user = sanitizeUserFromDecoded(decoded);
  return {
    authenticated: Boolean(user),
    user,
    profile,
    access: normalizeUserAccess(profile, user),
    expiresAt: decoded && decoded.exp ? decoded.exp * 1000 : null,
  };
}

module.exports = {
  createSessionClearCookie,
  createSessionPayload,
  createSessionSetCookie,
  loadSessionProfile,
  normalizeUserAccess,
  readJsonBody,
  readSessionCookie,
  sessionMaxAgeMs,
};
