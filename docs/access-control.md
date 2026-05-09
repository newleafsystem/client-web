# Access Control Contract

`client-web` consumes user access from the shared Firebase Auth + Firestore user record. User management is owned by `admin-web`; this app should not grow a second user-management surface.

## Shared User Record

Collection:

```text
users/{uid}
```

Required identity fields:

```js
{
  email: string,
  displayName: string,
  photoURL: string | null,
  status: 'active' | 'disabled' | 'inactive' | 'revoked' | 'suspended',
  roles: ['investor'] | ['admin'] | object,
  appAccess: {
    invest: boolean,
    picks: boolean,
    workbench: boolean,
    admin: boolean,
    quant: boolean,
    desk: boolean
  },
  accessManagedBy: 'admin-web',
  accessUpdatedAt: timestamp,
  accessUpdatedBy: string
}
```

`roles` may be an array or a boolean map. `appAccess` is the authoritative product entitlement map. `client-web` also accepts `apps`, `applications`, or `productAccess` as compatibility aliases, but new writes should use `appAccess`.

## Ownership

- `admin-web` is the authoritative writer for `roles`, `status`, and `appAccess`.
- `client-web` creates a missing profile on first sign-in with conservative defaults.
- `client-web` updates identity fields and `lastLogin`, but must not overwrite existing `roles` or `appAccess`.
- Both apps must use the same Firebase Auth user id and Firestore database: project `newleaf-trading`, database `newleafdb`.

## Defaults

For a new non-admin user:

```js
roles = ['investor']
appAccess = {
  invest: true,
  picks: false,
  workbench: false,
  admin: false,
  quant: false,
  desk: false
}
```

`VITE_ADMIN_EMAILS` is a bootstrap fallback only. If a matching user profile has no explicit `appAccess`, client-web grants all apps so the first admin is not locked out. Once admin-web writes `appAccess`, the explicit Firestore value wins.

Disabled, inactive, revoked, or suspended users receive no app access in client-web.

## Client Enforcement

Central files:

- `src/shared/auth/accessControl.js`: app ids, role ids, entitlement normalization, and navigation filtering.
- `src/shared/hooks/useAuth.js`: Firebase Auth state plus live `users/{uid}` profile subscription.
- `src/shared/components/BrandBar.jsx`: role/app-aware navigation rendering.
- `src/shared/components/AppAccessGate.jsx`: app route access UI.
- `scripts/workbench-nav-auth.js`: static Workbench nav and page access overlay.

Client-side checks improve user experience but are not a security boundary. Firestore rules and backend/provider checks must enforce the same app and role constraints for private data and privileged operations.
