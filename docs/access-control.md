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
  communicationEmail: string,
  displayName: string,
  photoURL: string | null,
  emailVerified: boolean,
  identityProviderIds: ['password'] | ['google.com'] | ['password', 'google.com'],
  authProviders: { password?: boolean, 'google.com'?: boolean },
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
- `client-web` updates identity fields, communication email, linked provider metadata, and `lastLogin`, but must not overwrite existing `roles` or `appAccess`.
- Both apps must use the same Firebase Auth user id and Firestore database: project `newleaf-trading`, database `newleafdb`.

## Registration And Identity Linking

- `/register` is the canonical public registration page for users who want email/password instead of Google sign-in.
- `/signin` is the canonical sign-in page and supports both email/password and Google.
- Email is required because it is the communication identity for account notifications and product access.
- Firebase Auth must keep Email/Password and Google providers enabled with one account per email address. If the backend allows multiple Auth users for the same email, client-side provider linking cannot prevent duplicate UIDs.
- `users/{uid}.communicationEmail` is set from the Firebase Auth email when the profile is created and preserved on later sign-ins unless an existing value is already present.
- If a user first registers with email/password and later chooses Google with the same email, `client-web` handles Firebase's account-exists flow by asking for the existing password once, then linking the Google credential to the same Firebase Auth user. The Firestore user profile remains under the same UID and `identityProviderIds` is updated to include both providers.
- Do not create a second Firestore profile to represent the same email. If Firebase Auth already contains separate users for the same email because provider linking was bypassed, that merge requires an admin/server-side repair; client-web cannot safely merge two Firebase UIDs by itself.

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

`sd.nirsha@gmail.com` and `manish28june@gmail.com` are hardcoded immutable admins in both sites. They always receive the admin role and all app access, even if a Firestore user record is disabled or has app access turned off.

`VITE_ADMIN_EMAILS` is a bootstrap fallback only. If a matching user profile has no explicit `appAccess`, client-web grants all apps so the first admin is not locked out. Once admin-web writes `appAccess`, the explicit Firestore value wins for env-only bootstrap admins.

Disabled, inactive, revoked, or suspended users receive no app access in client-web.

## Client Enforcement

Central files:

- `src/shared/auth/accessControl.js`: app ids, role ids, entitlement normalization, and navigation filtering.
- `src/shared/hooks/useAuth.js`: Firebase Auth state plus live `users/{uid}` profile subscription.
- `src/shared/components/BrandBar.jsx`: role/app-aware navigation rendering.
- `src/shared/components/AppAccessGate.jsx`: app route access UI.
- `src/shared/components/WorkbenchStaticPage.jsx`: React-owned wrapper for legacy Workbench HTML under the Workbench access gate.

Client-side checks improve user experience but are not a security boundary. Firestore rules and backend/provider checks must enforce the same app and role constraints for private data and privileged operations.
