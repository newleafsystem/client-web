import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandBar } from '../../shared/components/BrandBar';
import { Footer } from '../components/Footer';
import { LoginPage } from '../components/LoginPage';
import { useAuth } from '../../shared/hooks/useAuth';
import PageSEO from '../../shared/components/PageSEO';

function safeRedirectPath(search) {
  const value = new URLSearchParams(search).get('redirect') || '';
  if (!value.startsWith('/') || value.startsWith('//')) return '/invest';
  if (value.startsWith('/signin') || value.startsWith('/register')) return '/invest';
  return value;
}

export function AuthPage({ defaultMode = 'signup' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const redirectPath = safeRedirectPath(location.search);
  const isSignup = defaultMode === 'signup';
  const {
    user,
    access,
    loading,
    signOut,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    linkGoogleWithPassword,
  } = useAuth();

  if (!loading && user) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f5ef' }}>
      <PageSEO
        title={isSignup ? 'Register for NewLeaf System' : 'Sign in to NewLeaf System'}
        description="Create or access a NewLeaf account with email/password or Google. Matching Google identities are linked to the existing account for the same email."
        path={isSignup ? '/register' : '/signin'}
      />
      <BrandBar
        surface="root"
        authState={user ? 'in' : loading ? 'loading' : 'out'}
        user={user}
        access={access}
        onSignOut={signOut}
        showAuth={false}
      />

      <main style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
        alignItems: 'stretch',
        gap: 0,
        background: '#f7f5ef',
      }}>
        <section style={{
          background: 'var(--brand-gradient)',
          color: '#f7f5ef',
          padding: 'clamp(48px, 8vw, 96px) clamp(24px, 6vw, 72px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <p style={{
            margin: '0 0 14px',
            color: 'var(--brand-gold)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
          }}>
            NewLeaf Account
          </p>
          <h1 style={{
            margin: 0,
            maxWidth: 680,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(38px, 6vw, 76px)',
            lineHeight: .96,
            fontWeight: 700,
            letterSpacing: '-.03em',
          }}>
            {isSignup ? 'Register with any email. Add Google later.' : 'Sign in with one NewLeaf identity.'}
          </h1>
          <p style={{
            margin: '24px 0 0',
            maxWidth: 620,
            color: 'rgba(247,245,239,.74)',
            fontSize: 16,
            lineHeight: 1.75,
          }}>
            {isSignup
              ? 'Your email is used for account access, communication, and product permissions. If you later sign in with Google using the same email, NewLeaf links that identity into this account instead of creating a second profile.'
              : 'Use your password or Google sign-in from the same account page. When Google matches an existing password account, NewLeaf links it to the same Firebase user instead of creating a second profile.'}
          </p>
          <div style={{
            display: 'grid',
            gap: 12,
            marginTop: 36,
            maxWidth: 560,
          }}>
            {(isSignup ? [
              'Email/password registration for non-Gmail users',
              'One Firestore user profile shared across NewLeaf products',
              'Google identity linking when the email matches',
            ] : [
              'Email/password and Google sign-in on one page',
              'Redirects back to the product you opened',
              'Shared access checks across NewLeaf products',
            ]).map((item) => (
              <div key={item} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'rgba(247,245,239,.82)',
                fontSize: 14,
                fontWeight: 650,
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--brand-gold)',
                  flex: '0 0 auto',
                }} />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section style={{
          display: 'grid',
          placeItems: 'center',
          padding: 'clamp(28px, 5vw, 56px) 24px',
        }}>
          <LoginPage
            defaultMode={defaultMode}
            onSignInWithGoogle={signInWithGoogle}
            onSignInWithEmail={signInWithEmail}
            onSignUp={signUp}
            onLinkGoogleWithPassword={linkGoogleWithPassword}
            onComplete={() => navigate(redirectPath, { replace: true })}
            isModal
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
