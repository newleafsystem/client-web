export const APP_IDS = Object.freeze({
  ROOT: 'root',
  PICKS: 'picks',
  WORKBENCH: 'workbench',
  INVEST: 'invest',
  ADMIN: 'admin',
  QUANT: 'quant',
  DESK: 'desk',
});

export const ROLE_IDS = Object.freeze({
  ADMIN: 'admin',
  INVESTOR: 'investor',
  PICKS: 'picks',
  WORKBENCH: 'workbench',
  QUANT: 'quant',
  DESK: 'desk',
});

export const ACCESS_APP_IDS = Object.freeze([
  APP_IDS.PICKS,
  APP_IDS.WORKBENCH,
  APP_IDS.INVEST,
  APP_IDS.ADMIN,
  APP_IDS.QUANT,
  APP_IDS.DESK,
]);

export const IMMUTABLE_ADMIN_EMAILS = Object.freeze([
  'sd.nirsha@gmail.com',
  'manish28june@gmail.com',
]);

const DISABLED_STATUSES = new Set(['disabled', 'inactive', 'revoked', 'suspended']);
const BOOTSTRAP_ADMIN_EMAILS = import.meta.env.VITE_ADMIN_EMAILS || '';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeKey).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(normalizeKey)
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => enabled === true || enabled === 'true' || enabled === 1)
      .map(([key]) => normalizeKey(key))
      .filter(Boolean);
  }
  return [];
}

function normalizeBooleanMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, enabled]) => [normalizeKey(key), enabled === true || enabled === 'true' || enabled === 1])
      .filter(([key]) => key)
  );
}

function bootstrapAdminEmails() {
  return [...new Set([...IMMUTABLE_ADMIN_EMAILS, ...normalizeList(BOOTSTRAP_ADMIN_EMAILS)])];
}

export function isImmutableAdminUser(user) {
  const email = normalizeKey(user?.email);
  if (!email) return false;
  return IMMUTABLE_ADMIN_EMAILS.includes(email);
}

export function isBootstrapAdminUser(user) {
  const email = normalizeKey(user?.email);
  if (!email) return false;
  return bootstrapAdminEmails().includes(email);
}

export function defaultAppAccessForUser(user) {
  const allAccess = Object.fromEntries(ACCESS_APP_IDS.map((appId) => [appId, true]));
  if (isBootstrapAdminUser(user)) return allAccess;

  return {
    [APP_IDS.PICKS]: false,
    [APP_IDS.WORKBENCH]: false,
    [APP_IDS.INVEST]: true,
    [APP_IDS.ADMIN]: false,
    [APP_IDS.QUANT]: false,
    [APP_IDS.DESK]: false,
  };
}

export function defaultRolesForUser(user) {
  return isBootstrapAdminUser(user) ? [ROLE_IDS.ADMIN] : [ROLE_IDS.INVESTOR];
}

export function createDefaultUserEntitlements(user) {
  const immutableAdmin = isImmutableAdminUser(user);
  return {
    status: 'active',
    roles: defaultRolesForUser(user),
    appAccess: defaultAppAccessForUser(user),
    accessManagedBy: immutableAdmin ? 'immutable-admin' : isBootstrapAdminUser(user) ? 'bootstrap-env' : 'admin-web',
    immutable: immutableAdmin,
  };
}

export function normalizeUserAccess(profile, user) {
  const hasProfile = Boolean(profile && typeof profile === 'object');
  const rawRoles = hasProfile ? profile.roles || profile.roleMap || profile.role : null;
  const roleList = normalizeList(rawRoles);
  const roleMap = Object.fromEntries(roleList.map((role) => [role, true]));
  const bootstrapAdmin = isBootstrapAdminUser(user);
  const immutableAdmin = isImmutableAdminUser(user);

  if (immutableAdmin || (bootstrapAdmin && roleList.length === 0)) {
    roleMap[ROLE_IDS.ADMIN] = true;
  }

  if (user && Object.keys(roleMap).length === 0) {
    roleMap[ROLE_IDS.INVESTOR] = true;
  }

  const explicitAppAccess =
    hasProfile &&
    (profile.appAccess || profile.apps || profile.applications || profile.productAccess);
  let appMap = normalizeBooleanMap(explicitAppAccess);

  if (immutableAdmin) {
    appMap = Object.fromEntries(ACCESS_APP_IDS.map((appId) => [appId, true]));
  } else if (!explicitAppAccess) {
    if (bootstrapAdmin || roleMap[ROLE_IDS.ADMIN]) {
      appMap = Object.fromEntries(ACCESS_APP_IDS.map((appId) => [appId, true]));
    } else if (user) {
      appMap = defaultAppAccessForUser(user);
    }
  }

  const status = normalizeKey(profile?.status || (profile?.disabled ? 'disabled' : 'active'));
  const disabled = !immutableAdmin && (profile?.disabled === true || DISABLED_STATUSES.has(status));

  if (disabled) {
    appMap = Object.fromEntries(ACCESS_APP_IDS.map((appId) => [appId, false]));
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
    hasRole(roleId) {
      return Boolean(roleMap[normalizeKey(roleId)]);
    },
    canAccessApp(appId) {
      const normalizedAppId = normalizeKey(appId);
      if (normalizedAppId === APP_IDS.ROOT) return true;
      if (disabled) return false;
      return Boolean(appMap[normalizedAppId]);
    },
  };

  access.isAdmin = access.hasRole(ROLE_IDS.ADMIN) || access.canAccessApp(APP_IDS.ADMIN);
  return access;
}

function canShowItem(item, access, options) {
  const authState = options?.authState || 'out';
  if (item.public === true && authState !== 'in') return true;
  if (item.requiredApp && !access.canAccessApp(item.requiredApp)) return false;
  if (item.requiredRole && !access.hasRole(item.requiredRole)) return false;
  return true;
}

function filterDropdownItems(items, access, options) {
  const visible = [];
  let pendingHeading = null;
  let pendingDivider = false;

  for (const item of items || []) {
    if (item.heading) {
      pendingHeading = item;
      pendingDivider = false;
      continue;
    }

    if (item.divider) {
      pendingDivider = visible.length > 0;
      pendingHeading = null;
      continue;
    }

    if (!canShowItem(item, access, options)) continue;

    if (pendingDivider && visible.length > 0 && !visible[visible.length - 1].divider) {
      visible.push({ divider: true });
    }
    if (pendingHeading) {
      visible.push(pendingHeading);
    }

    visible.push(item);
    pendingHeading = null;
    pendingDivider = false;
  }

  while (visible.length && (visible[visible.length - 1].divider || visible[visible.length - 1].heading)) {
    visible.pop();
  }

  return visible;
}

export function filterNavSections(sections, access, options = {}) {
  const userAccess = access || normalizeUserAccess(null, null);

  return (sections || []).flatMap((item) => {
    if (item.kind === 'dropdown') {
      const items = filterDropdownItems(item.items, userAccess, options);
      if (!canShowItem(item, userAccess, options) && !item.public) return [];
      if (!items.length) {
        return item.href && canShowItem(item, userAccess, options)
          ? [{ ...item, kind: 'link', items: undefined }]
          : [];
      }
      return [{ ...item, items }];
    }

    return canShowItem(item, userAccess, options) ? [item] : [];
  });
}
