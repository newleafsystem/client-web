import { APP_IDS, normalizeUserAccess } from '../auth/accessControl';
import { SectionLoader } from './LeafLoader';

function currentSignInUrl() {
  if (typeof window === 'undefined') return '/signin';
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/signin?redirect=${encodeURIComponent(redirect)}`;
}

function AccessCard({ title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <main style={{
      minHeight: 'calc(100vh - 64px)',
      display: 'grid',
      placeItems: 'center',
      padding: '48px 20px',
      background: '#F7F5F0',
    }}>
      <section style={{
        width: 'min(100%, 520px)',
        background: '#ffffff',
        border: '1px solid rgba(15,61,46,.12)',
        borderRadius: 8,
        padding: '32px',
        boxShadow: '0 18px 48px rgba(15, 61, 46, .08)',
        textAlign: 'center',
      }}>
        <p style={{
          margin: '0 0 10px',
          color: '#C9A96E',
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
        }}>
          Account Access
        </p>
        <h1 style={{
          margin: 0,
          color: '#0B2D23',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 500,
          lineHeight: 1.1,
        }}>
          {title}
        </h1>
        <p style={{
          margin: '16px 0 0',
          color: '#55554f',
          fontSize: 14,
          lineHeight: 1.7,
        }}>
          {message}
        </p>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'center',
          marginTop: 24,
        }}>
          {primaryLabel && (
            <button
              type="button"
              onClick={onPrimary}
              style={{
                minHeight: 42,
                padding: '0 20px',
                border: '1px solid var(--brand-button-primary-border)',
                borderRadius: 6,
                background: 'var(--brand-button-primary-bg)',
                color: 'var(--brand-button-primary-text)',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              style={{
                minHeight: 42,
                padding: '0 20px',
                border: '1px solid rgba(15,61,46,.2)',
                borderRadius: 6,
                background: '#ffffff',
                color: '#0B2D23',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export function AppAccessDenied({ appName = 'this application', onSignOut }) {
  return (
    <AccessCard
      title={`${appName} is not enabled`}
      message="Your NewLeaf account does not currently include this application. Access is managed from the admin-web user record and will update here after an admin changes your permissions."
      secondaryLabel={onSignOut ? 'Sign Out' : undefined}
      onSecondary={onSignOut}
    />
  );
}

export function SignInRequired({ appName = 'this application' }) {
  return (
    <AccessCard
      title={`Sign in to open ${appName}`}
      message="This application is tied to your NewLeaf account. Sign in so we can check the application access assigned to your user profile."
      primaryLabel="Sign In / Register"
      onPrimary={() => { window.location.href = currentSignInUrl(); }}
    />
  );
}

export function AppAccessGate({
  access,
  appId,
  appName,
  user,
  loading = false,
  onSignIn,
  onSignOut,
  allowAdmin = false,
  children,
}) {
  const userAccess = access || normalizeUserAccess(null, user);
  const allowed =
    userAccess.canAccessApp(appId) ||
    (allowAdmin && userAccess.canAccessApp(APP_IDS.ADMIN));

  if (loading) {
    return <SectionLoader label="Checking access" minHeight={360} />;
  }

  if (!user) {
    return <SignInRequired appName={appName} onSignIn={onSignIn} />;
  }

  if (!allowed) {
    return <AppAccessDenied appName={appName} onSignOut={onSignOut} />;
  }

  return children;
}
